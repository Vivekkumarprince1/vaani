package auth

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type Claims struct {
	UserID            uuid.UUID `json:"user_id"`
	Username          string    `json:"username"`
	Role              string    `json:"role"`
	PreferredLanguage string    `json:"preferred_language,omitempty"`
	jwt.RegisteredClaims
}

type contextKey string

const UserContextKey contextKey = "user"

type Authenticator struct {
	jwtSecret []byte
}

func NewAuthenticator(secret string) *Authenticator {
	return &Authenticator{jwtSecret: []byte(secret)}
}

// HashPassword hashes a raw password using bcrypt
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	return string(bytes), err
}

// CheckPasswordHash compares password against hash
func CheckPasswordHash(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// GenerateToken generates a signed JWT valid for 7 days
func (a *Authenticator) GenerateToken(userID uuid.UUID, username, role, lang string) (string, error) {
	if lang == "" {
		lang = "en"
	}
	claims := Claims{
		UserID:            userID,
		Username:          username,
		Role:              role,
		PreferredLanguage: lang,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.jwtSecret)
}

// ValidateToken parses and validates a JWT token string
func (a *Authenticator) ValidateToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return a.jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// Middleware verifies JWT from Authorization header or query param
func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		tokenStr := ""

		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
				tokenStr = parts[1]
			}
		}

		// Also allow token from query param (useful for WebSocket connection handshake)
		if tokenStr == "" {
			tokenStr = r.URL.Query().Get("token")
		}

		if tokenStr == "" {
			http.Error(w, `{"error":"missing authorization token"}`, http.StatusUnauthorized)
			return
		}

		claims, err := a.ValidateToken(tokenStr)
		if err != nil {
			http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// OptionalMiddleware extracts Claims if token is present, but does not reject request if absent
func (a *Authenticator) OptionalMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		tokenStr := ""

		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
				tokenStr = parts[1]
			}
		}

		if tokenStr == "" {
			tokenStr = r.URL.Query().Get("token")
		}

		if tokenStr != "" {
			if claims, err := a.ValidateToken(tokenStr); err == nil && claims != nil {
				ctx := context.WithValue(r.Context(), UserContextKey, claims)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// RequireRole checks if authenticated user matches allowed roles
func RequireRole(allowedRoles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := r.Context().Value(UserContextKey).(*Claims)
			if !ok || claims == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			allowed := false
			for _, role := range allowedRoles {
				if claims.Role == role {
					allowed = true
					break
				}
			}

			if !allowed {
				http.Error(w, `{"error":"forbidden: insufficient privileges"}`, http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// GetUserFromContext retrieves authenticated Claims from request context
func GetUserFromContext(ctx context.Context) *Claims {
	if claims, ok := ctx.Value(UserContextKey).(*Claims); ok {
		return claims
	}
	return nil
}

// IPRateLimiter implements a high-throughput, thread-safe token bucket rate limiter per client IP
type IPRateLimiter struct {
	mu     sync.Mutex
	limits map[string]*clientBucket
	rate   float64 // tokens per second
	burst  int
}

type clientBucket struct {
	tokens     float64
	lastUpdate time.Time
}

func NewIPRateLimiter(rate float64, burst int) *IPRateLimiter {
	limiter := &IPRateLimiter{
		limits: make(map[string]*clientBucket),
		rate:   rate,
		burst:  burst,
	}

	// Periodically evict idle IP records to prevent memory growth
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			limiter.mu.Lock()
			now := time.Now()
			for ip, bucket := range limiter.limits {
				if now.Sub(bucket.lastUpdate) > 10*time.Minute {
					delete(limiter.limits, ip)
				}
			}
			limiter.mu.Unlock()
		}
	}()

	return limiter
}

func (limiter *IPRateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			ip = strings.TrimSpace(strings.Split(xff, ",")[0])
		}
		if host, _, err := net.SplitHostPort(ip); err == nil {
			ip = host
		}

		limiter.mu.Lock()
		bucket, exists := limiter.limits[ip]
		now := time.Now()

		if !exists {
			bucket = &clientBucket{
				tokens:     float64(limiter.burst) - 1,
				lastUpdate: now,
			}
			limiter.limits[ip] = bucket
			limiter.mu.Unlock()
			next.ServeHTTP(w, r)
			return
		}

		// Refill tokens based on elapsed time
		elapsed := now.Sub(bucket.lastUpdate).Seconds()
		bucket.tokens += elapsed * limiter.rate
		if bucket.tokens > float64(limiter.burst) {
			bucket.tokens = float64(limiter.burst)
		}
		bucket.lastUpdate = now

		if bucket.tokens < 1.0 {
			limiter.mu.Unlock()
			w.Header().Set("Retry-After", "5")
			http.Error(w, `{"error":"too many requests: please slow down"}`, http.StatusTooManyRequests)
			return
		}

		bucket.tokens -= 1.0
		limiter.mu.Unlock()
		next.ServeHTTP(w, r)
	})
}
