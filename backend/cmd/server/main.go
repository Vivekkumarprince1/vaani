package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"vaani-v2/backend/internal/auth"
	"vaani-v2/backend/internal/config"
	"vaani-v2/backend/internal/database"
	"vaani-v2/backend/internal/domain"
	"vaani-v2/backend/internal/handlers"
	"vaani-v2/backend/internal/livekit"
	"vaani-v2/backend/internal/providers"
	"vaani-v2/backend/internal/redis"
	"vaani-v2/backend/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	log.Println("🎙️  Starting Vaani v2 Real-Time Platform...")

	// 1. Load Environment
	env := config.LoadEnv()
	if err := env.Validate(); err != nil {
		log.Fatalf("❌ Invalid environment configuration: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 2. Database Connection (PostgreSQL)
	db, err := database.Connect(ctx, env.DatabaseURL)
	if err != nil {
		log.Fatalf("❌ Database connection error: %v", err)
	}
	defer db.Close()

	// 3. Cache & PubSub Connection (Redis)
	rdb, err := redis.Connect(env.RedisURL)
	if err != nil {
		log.Printf("⚠️  Redis warning: %v (running in single-instance mode)", err)
	}

	// 4. Dynamic Admin Config Engine
	configEngine := config.NewConfigEngine(env, db, rdb)
	if err := configEngine.LoadFromDB(ctx); err != nil {
		log.Printf("ℹ️  Seeding initial system settings to database...")
		// Save default settings into system_settings if empty
		_ = seedInitialSettings(ctx, db, configEngine)
	}
	configEngine.StartHotReloadListener(ctx)

	// 5. Auto-Seed Superadmin
	if err := seedSuperadmin(ctx, db, env); err != nil {
		log.Printf("⚠️  Superadmin bootstrap note: %v", err)
	}

	// 6. LiveKit Manager
	livekitMgr := livekit.NewManager(env.LiveKitURL, env.LiveKitAPIKey, env.LiveKitAPISecret)

	// 7. Provider Manager (Mirroring legacy Vaani AI engines & STS)
	providerMgr := providers.NewProviderManager(db, rdb, env, []byte(env.ConfigEncryptionKey))
	if err := providerMgr.Initialize(ctx); err != nil {
		log.Printf("⚠️  ProviderManager init warning: %v", err)
	}

	// 8. Authenticator
	authenticator := auth.NewAuthenticator(env.JWTSecret)

	// 9. HTTP Router
	r := chi.NewRouter()

	// Standard Middlewares
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Compress(5))
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS Setup
	var allowedOrigins []string
	if env.AllowedOrigins != "" {
		for _, o := range strings.Split(env.AllowedOrigins, ",") {
			trimmed := strings.TrimSpace(o)
			if trimmed != "" {
				allowedOrigins = append(allowedOrigins, trimmed)
			}
		}
	}
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{"http://localhost:5173", "http://localhost:3000"}
	}
	var allowedOriginSuffixes []string
	for _, suffix := range strings.Split(env.AllowedOriginSuffixes, ",") {
		if trimmed := strings.TrimSpace(strings.ToLower(suffix)); trimmed != "" {
			allowedOriginSuffixes = append(allowedOriginSuffixes, trimmed)
		}
	}

	// 10. WebSocket Hub (origin policy is shared with HTTP CORS policy)
	hub := ws.NewHubWithSuffixes(rdb, allowedOriginSuffixes, allowedOrigins...)
	go hub.Run()

	// 11. Auth & Handlers
	authHandler := handlers.NewAuthHandler(db, authenticator)
	adminHandler := handlers.NewAdminHandler(db, rdb, configEngine, livekitMgr, providerMgr)
	chatHandler := handlers.NewChatHandler(db, hub, providerMgr)
	callHandler := handlers.NewCallHandler(db, hub, livekitMgr, providerMgr)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Token bucket rate limiter for auth endpoints (5 req/sec with burst of 15 per IP)
	authLimiter := auth.NewIPRateLimiter(5.0, 15)
	ttsLimiter := auth.NewIPRateLimiter(2.0, 10)

	// Health Check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"status":"ok","version":"2.0.0","engine":"golang","deployment":"oci-cicd-v2"}`)
	})

	// Readiness Check: only reports ready after PostgreSQL is reachable.
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := db.Pool.Ping(ctx); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprint(w, `{"status":"not_ready","dependency":"postgres"}`)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"status":"ready","dependency":"postgres"}`)
	})

	// WebSocket Endpoint
	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r, authenticator)
	})

	// API Routes
	r.Route("/api", func(api chi.Router) {
		// Public Auth with Rate Limiting
		api.Route("/auth", func(a chi.Router) {
			a.With(authLimiter.Limit).Post("/register", authHandler.Register)
			a.With(authLimiter.Limit).Post("/login", authHandler.Login)

			// Protected user routes
			a.Group(func(protected chi.Router) {
				protected.Use(authenticator.Middleware)
				protected.Get("/me", authHandler.Me)
				protected.Put("/language", authHandler.UpdateLanguage)
				protected.Get("/users", authHandler.ListUsers)
			})
		})

		// Protected Chat & Groups
		api.Route("/chat", func(c chi.Router) {
			c.Use(authenticator.Middleware)
			c.Get("/rooms", chatHandler.ListRooms)
			c.Post("/rooms", chatHandler.CreateRoom)
			c.Put("/rooms/{id}", chatHandler.UpdateRoom)
			c.Delete("/rooms/{id}", chatHandler.DeleteRoom)
			c.Get("/rooms/{id}/members", chatHandler.GetRoomMembers)
			c.Post("/rooms/{id}/members", chatHandler.AddRoomMembers)
			c.Delete("/rooms/{id}/members/{userId}", chatHandler.RemoveRoomMember)
			c.Get("/rooms/{id}/messages", chatHandler.GetMessages)
			c.Post("/rooms/{id}/messages", chatHandler.SendMessage)
			c.Post("/messages/{id}/translate", chatHandler.TranslateMessage)
		})

		// Meeting preview & resolution (publicly accessible, but extracts claims if logged in)
		api.With(authenticator.OptionalMiddleware).Get("/calls/meeting/{slug}", callHandler.ResolveMeeting)

		// Calls
		api.Route("/calls", func(c chi.Router) {
			// TTS can incur provider charges, so it requires auth and is rate-limited.
			c.With(authenticator.Middleware, ttsLimiter.Limit).Get("/tts", callHandler.HandleTTS)

			// Protected Call Actions
			c.Group(func(p chi.Router) {
				p.Use(authenticator.Middleware)
				p.Post("/token", callHandler.GetToken)
				p.Post("/initiate", callHandler.InitiateCall)
				p.Post("/end", callHandler.EndCall)
				p.Post("/speech-translate", callHandler.HandleCallSpeech)
				p.Post("/audio-translate", callHandler.HandleCallAudio)
				p.Post("/meeting/instant", callHandler.CreateInstantMeeting)
				p.Post("/meeting/{slug}/join", callHandler.JoinMeeting)
			})
		})

		// Admin Control Room (Admin / Superadmin only)
		api.Route("/admin", func(a chi.Router) {
			a.Use(authenticator.Middleware)
			a.Use(auth.RequireRole(domain.RoleAdmin, domain.RoleSuperadmin))

			// Metrics
			a.Get("/metrics", adminHandler.GetMetrics)

			// Provider Engine (STS, STT, Translation, TTS, SFU, Pipeline)
			a.Get("/providers", adminHandler.GetProviders)
			a.Put("/providers/{category}", adminHandler.UpdateProviderCategory)
			a.Post("/providers/test", adminHandler.TestProvider)
			a.Post("/realtime/session", adminHandler.CreateRealtimeSession)

			// Live Room Management
			a.Get("/rooms", adminHandler.GetLiveRooms)
			a.Delete("/rooms/{slug}", adminHandler.TerminateRoom)

			// User Management
			a.Get("/users", adminHandler.ListUsers)
			a.Patch("/users/{id}/role", adminHandler.UpdateUserRole)
			a.Patch("/users/{id}/status", adminHandler.UpdateUserStatus)

			// System Settings (Audio DSP, Flags, Languages)
			a.Get("/config", adminHandler.GetConfig)
			a.Put("/config/{category}", adminHandler.UpdateConfig)
		})
	})

	// 10. Start Server
	server := &http.Server{
		Addr:         ":" + env.Port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Printf("🚀 Vaani v2 Backend listening on port %s (env: %s)", env.Port, env.Env)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ HTTP server error: %v", err)
		}
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("📡 Shutting down server gracefully...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("❌ Server forced to shutdown: %v", err)
	}

	log.Println("✅ Vaani v2 Server stopped cleanly")
}

func seedSuperadmin(ctx context.Context, db *database.DB, env config.EnvConfig) error {
	var count int
	_ = db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE role = 'superadmin'").Scan(&count)
	if count > 0 {
		return nil
	}

	hash, err := auth.HashPassword(env.SuperadminPassword)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO users (username, email, password_hash, role, preferred_language, is_active, is_email_verified)
		VALUES ($1, $2, $3, $4, 'en', TRUE, TRUE)
		ON CONFLICT (email) DO NOTHING`

	_, err = db.Pool.Exec(ctx, query, env.SuperadminUsername, env.SuperadminEmail, hash, domain.RoleSuperadmin)
	if err == nil {
		log.Printf("👑 Initial Superadmin created: %s (%s)", env.SuperadminEmail, env.SuperadminUsername)
	}
	return err
}

func seedInitialSettings(ctx context.Context, db *database.DB, cfg *config.ConfigEngine) error {
	dynamic := cfg.GetDynamic()
	// ProviderManager owns provider categories. ConfigEngine owns only
	// audio, feature flags, and language settings.
	categories := []string{"audio_dsp", "feature_flags", "languages"}

	for _, cat := range categories {
		var activeKey string
		var configData interface{}

		switch cat {
		case "audio_dsp":
			activeKey = "default"
			configData = dynamic.AudioDSP
		case "feature_flags":
			activeKey = "default"
			configData = dynamic.FeatureFlags
		case "languages":
			activeKey = "default"
			configData = dynamic.Languages
		}

		query := `
			INSERT INTO system_settings (category, active_key, config)
			VALUES ($1, $2, $3)
			ON CONFLICT (category) DO NOTHING`

		_, _ = db.Pool.Exec(ctx, query, cat, activeKey, configData)
	}
	return nil
}
