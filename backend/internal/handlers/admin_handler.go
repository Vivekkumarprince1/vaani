package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"vaani-v2/backend/internal/auth"
	"vaani-v2/backend/internal/config"
	"vaani-v2/backend/internal/database"
	"vaani-v2/backend/internal/domain"
	"vaani-v2/backend/internal/livekit"
	"vaani-v2/backend/internal/providers"
	"vaani-v2/backend/internal/redis"
	"vaani-v2/backend/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	livekitProto "github.com/livekit/protocol/livekit"
)

type AdminHandler struct {
	db           *database.DB
	redis        *redis.Client
	configEngine *config.ConfigEngine
	livekitMgr   *livekit.Manager
	providerMgr  *providers.ProviderManager
	hub          *ws.Hub
}

func NewAdminHandler(db *database.DB, rdb *redis.Client, cfg *config.ConfigEngine, lk *livekit.Manager, pm *providers.ProviderManager, hub *ws.Hub) *AdminHandler {
	return &AdminHandler{
		db:           db,
		redis:        rdb,
		configEngine: cfg,
		livekitMgr:   lk,
		providerMgr:  pm,
		hub:          hub,
	}
}

// GetProviders returns all provider categories with masked credentials for UI
func (h *AdminHandler) GetProviders(w http.ResponseWriter, r *http.Request) {
	configs := h.providerMgr.GetMaskedConfigs()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

// UpdateProviderCategory updates activeProvider and/or credentials for a category
func (h *AdminHandler) UpdateProviderCategory(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	category := chi.URLParam(r, "category")

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
		return
	}

	updatedConfig, err := h.providerMgr.UpdateCategoryConfig(r.Context(), category, body, claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	// Audit Log
	_, _ = h.db.Pool.Exec(r.Context(),
		"INSERT INTO audit_logs (admin_id, action, details) VALUES ($1, $2, $3)",
		claims.UserID, "UPDATE_PROVIDER_"+category, body,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"category": category,
		"config":   updatedConfig,
	})
}

// TestProvider runs a live connectivity check with ping latency for any provider
func (h *AdminHandler) TestProvider(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Category     string                 `json:"category"`
		ProviderName string                 `json:"providerName"`
		Credentials  map[string]interface{} `json:"credentials"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Category == "" || body.ProviderName == "" {
		http.Error(w, `{"error":"category and providerName are required"}`, http.StatusBadRequest)
		return
	}

	res, err := h.providerMgr.TestConnection(body.Category, body.ProviderName, body.Credentials)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// CreateRealtimeSession generates ephemeral session token for OpenAI Realtime Speech-to-Speech (Version A STS)
func (h *AdminHandler) CreateRealtimeSession(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	_ = json.NewDecoder(r.Body).Decode(&body)

	res, err := h.providerMgr.CreateRealtimeSession(body)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// GetMetrics returns real-time metrics and active provider summary
func (h *AdminHandler) GetMetrics(w http.ResponseWriter, r *http.Request) {
	var totalUsers, onlineUsers, adminUsers, activeCalls, totalMessages int
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM users").Scan(&totalUsers)
	if h.hub != nil {
		onlineUsers = h.hub.OnlineUserCount()
	}
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM users WHERE role IN ('admin', 'superadmin')").Scan(&adminUsers)
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM call_logs WHERE status = 'active'").Scan(&activeCalls)
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM messages").Scan(&totalMessages)

	// Incorporate real LiveKit SFU channels
	sfuActiveRooms := 0
	sfuActiveParticipants := 0
	if h.livekitMgr != nil {
		if lkRooms, err := h.livekitMgr.ListRooms(r.Context()); err == nil {
			for _, rk := range lkRooms {
				if rk != nil && rk.NumParticipants > 0 {
					sfuActiveRooms++
					sfuActiveParticipants += int(rk.NumParticipants)
				}
			}
			if sfuActiveRooms > activeCalls {
				activeCalls = sfuActiveRooms
			}
		}
	}

	pipeAct, _ := h.providerMgr.GetActiveProvider("pipeline")
	rtAct, _ := h.providerMgr.GetActiveProvider("realtime")
	sttAct, _ := h.providerMgr.GetActiveProvider("stt")
	ttsAct, _ := h.providerMgr.GetActiveProvider("tts")
	transAct, _ := h.providerMgr.GetActiveProvider("translation")
	sfuAct, _ := h.providerMgr.GetActiveProvider("sfu")

	activeProviders := map[string]string{
		"pipeline":    pipeAct,
		"realtime":    rtAct,
		"stt":         sttAct,
		"tts":         ttsAct,
		"translation": transAct,
		"sfu":         sfuAct,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"metrics": map[string]interface{}{
			"totalUsers":            totalUsers,
			"onlineUsers":           onlineUsers,
			"adminUsers":            adminUsers,
			"activeCalls":           activeCalls,
			"totalMessages":         totalMessages,
			"sfuActiveRooms":        sfuActiveRooms,
			"sfuActiveParticipants": sfuActiveParticipants,
		},
		"activeProviders": activeProviders,
		"serverTime":      time.Now(),
	})
}

// GetLiveRooms lists active calls dynamically from LiveKit SFU and PostgreSQL
func (h *AdminHandler) GetLiveRooms(w http.ResponseWriter, r *http.Request) {
	type ParticipantDetail struct {
		Identity         string `json:"identity"`
		Name             string `json:"name"`
		JoinedAt         int64  `json:"joinedAt"`
		IsAudioPublished bool   `json:"isAudioPublished"`
		IsVideoPublished bool   `json:"isVideoPublished"`
		Language         string `json:"language"`
	}

	type LiveRoomItem struct {
		ID              string              `json:"id"`
		CallRoomID      string              `json:"callRoomId"`
		CallType        string              `json:"callType"`
		Status          string              `json:"status"`
		StartedAt       time.Time           `json:"startedAt"`
		DurationSeconds int64               `json:"durationSeconds"`
		InitiatorName   string              `json:"initiatorName"`
		RoomName        string              `json:"roomName"`
		LivekitActive   bool                `json:"livekitActive"`
		NumParticipants int                 `json:"numParticipants"`
		Participants    []ParticipantDetail `json:"participants"`
		SfuCluster      string              `json:"sfuCluster"`
	}

	liveRoomsMap := make(map[string]*livekitProto.Room)
	if h.livekitMgr != nil {
		if lkRooms, err := h.livekitMgr.ListRooms(r.Context()); err == nil {
			for _, rk := range lkRooms {
				if rk != nil && rk.NumParticipants > 0 {
					liveRoomsMap[rk.Name] = rk
				}
			}
		}
	}

	// Auto-expire abandoned ringing calls older than 90 seconds
	_, _ = h.db.Pool.Exec(r.Context(), "UPDATE call_logs SET status = 'missed', ended_at = NOW() WHERE status = 'ringing' AND started_at < NOW() - INTERVAL '90 seconds'")

	query := `
		SELECT 
			cl.id, 
			cl.call_room_id, 
			cl.call_type, 
			cl.status, 
			cl.started_at,
			COALESCE(u.username, 'Anonymous') as initiator_name,
			COALESCE(r.name, '') as room_name
		FROM call_logs cl
		LEFT JOIN users u ON u.id = cl.initiator_id
		LEFT JOIN rooms r ON r.id = cl.room_id
		WHERE cl.status IN ('active', 'ringing')
		ORDER BY cl.started_at DESC`

	rows, err := h.db.Pool.Query(r.Context(), query)
	rooms := make([]LiveRoomItem, 0)
	visited := make(map[string]bool)

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id uuid.UUID
			var callRoomID, callType, status, initiatorName, roomName string
			var startedAt time.Time

			if err := rows.Scan(&id, &callRoomID, &callType, &status, &startedAt, &initiatorName, &roomName); err == nil {
				lkRoom, hasLK := liveRoomsMap[callRoomID]

				// Stale cleanup: If call is marked active in DB but no longer exists on LiveKit SFU for > 60s
				if !hasLK && status == "active" && time.Since(startedAt) > 60*time.Second {
					_, _ = h.db.Pool.Exec(r.Context(), "UPDATE call_logs SET status = 'ended', ended_at = NOW() WHERE id = $1", id)
					continue
				}

				if roomName == "" {
					roomName = "Direct Call"
				}

				item := LiveRoomItem{
					ID:              id.String(),
					CallRoomID:      callRoomID,
					CallType:        callType,
					Status:          status,
					StartedAt:       startedAt,
					DurationSeconds: int64(time.Since(startedAt).Seconds()),
					InitiatorName:   initiatorName,
					RoomName:        roomName,
					LivekitActive:   hasLK,
					SfuCluster:      "LiveKit Cloud",
					Participants:    make([]ParticipantDetail, 0),
				}

				if hasLK {
					visited[callRoomID] = true
					item.NumParticipants = int(lkRoom.NumParticipants)
					if item.NumParticipants == 0 {
						item.NumParticipants = 1
					}
					// Fetch detailed participant list from LiveKit SFU
					if h.livekitMgr != nil {
						if lkParticipants, err := h.livekitMgr.ListParticipants(r.Context(), callRoomID); err == nil {
							for _, p := range lkParticipants {
								part := ParticipantDetail{
									Identity: p.Identity,
									Name:     p.Name,
									JoinedAt: p.JoinedAt,
									Language: "en",
								}
								if part.Name == "" {
									part.Name = p.Identity
								}
								for _, tr := range p.Tracks {
									if tr.Type == livekitProto.TrackType_AUDIO && !tr.Muted {
										part.IsAudioPublished = true
									}
									if tr.Type == livekitProto.TrackType_VIDEO && !tr.Muted {
										part.IsVideoPublished = true
									}
								}
								if p.Metadata != "" {
									var meta map[string]interface{}
									if json.Unmarshal([]byte(p.Metadata), &meta) == nil {
										if l, ok := meta["preferred_language"].(string); ok && l != "" {
											part.Language = l
										}
									}
								}
								item.Participants = append(item.Participants, part)
							}
						}
					}
				} else if status == "ringing" {
					item.NumParticipants = 1
				}

				rooms = append(rooms, item)
			}
		}
	}

	// Add any dynamic LiveKit SFU rooms not yet recorded in call_logs
	for roomName, rk := range liveRoomsMap {
		if !visited[roomName] {
			started := time.Unix(rk.CreationTime, 0)
			item := LiveRoomItem{
				ID:              uuid.New().String(),
				CallRoomID:      roomName,
				CallType:        "video",
				Status:          "active",
				StartedAt:       started,
				DurationSeconds: int64(time.Since(started).Seconds()),
				InitiatorName:   "LiveKit Participant",
				RoomName:        roomName,
				LivekitActive:   true,
				NumParticipants: int(rk.NumParticipants),
				SfuCluster:      "LiveKit Cloud",
				Participants:    make([]ParticipantDetail, 0),
			}
			if h.livekitMgr != nil {
				if lkParticipants, err := h.livekitMgr.ListParticipants(r.Context(), roomName); err == nil {
					for _, p := range lkParticipants {
						part := ParticipantDetail{
							Identity: p.Identity,
							Name:     p.Name,
							JoinedAt: p.JoinedAt,
							Language: "en",
						}
						if part.Name == "" {
							part.Name = p.Identity
						}
						if item.InitiatorName == "LiveKit Participant" && part.Name != "" {
							item.InitiatorName = part.Name
						}
						for _, tr := range p.Tracks {
							if tr.Type == livekitProto.TrackType_AUDIO && !tr.Muted {
								part.IsAudioPublished = true
							}
							if tr.Type == livekitProto.TrackType_VIDEO && !tr.Muted {
								part.IsVideoPublished = true
							}
						}
						item.Participants = append(item.Participants, part)
					}
				}
			}
			rooms = append(rooms, item)
		}
	}

	totalParticipants := 0
	for _, rm := range rooms {
		totalParticipants += rm.NumParticipants
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"rooms": rooms,
		"sfu": map[string]interface{}{
			"status":            "healthy",
			"cluster":           "LiveKit Cloud (Auto-Routed SFU)",
			"totalActiveRooms":  len(rooms),
			"totalParticipants": totalParticipants,
		},
	})
}

// ListUsers returns paginated users for admin management
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, username, email, phone, role, preferred_language, status, is_active, created_at, last_active_at
		 FROM users ORDER BY created_at DESC LIMIT 100`,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch users"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := make([]domain.User, 0)
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.Phone, &u.Role, &u.PreferredLanguage, &u.Status, &u.IsActive, &u.CreatedAt, &u.LastActiveAt); err == nil {
			if h.hub != nil {
				if h.hub.IsOnline(u.ID) {
					u.Status = domain.StatusOnline
				} else {
					u.Status = domain.StatusOffline
				}
			}
			users = append(users, u)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// UpdateUserRole changes a user's role
func (h *AdminHandler) UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	targetIDStr := chi.URLParam(r, "id")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Role == "" {
		http.Error(w, `{"error":"role required"}`, http.StatusBadRequest)
		return
	}

	var targetCurrentRole string
	err = h.db.Pool.QueryRow(r.Context(), "SELECT role FROM users WHERE id = $1", targetID).Scan(&targetCurrentRole)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	// Only superadmin can promote/demote admin or superadmin roles
	if (body.Role == "superadmin" || targetCurrentRole == "superadmin" || body.Role == "admin" || targetCurrentRole == "admin") && claims.Role != "superadmin" {
		http.Error(w, `{"error":"forbidden: only superadmin can modify admin or superadmin privileges"}`, http.StatusForbidden)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "UPDATE users SET role = $1 WHERE id = $2", body.Role, targetID)
	if err != nil {
		http.Error(w, `{"error":"failed to update role"}`, http.StatusInternalServerError)
		return
	}

	// Audit Log
	_, _ = h.db.Pool.Exec(r.Context(),
		"INSERT INTO audit_logs (admin_id, action, details) VALUES ($1, 'UPDATE_ROLE', json_build_object('target', $2::text, 'role', $3))",
		claims.UserID, targetIDStr, body.Role,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "role": body.Role})
}

// UpdateUserStatus toggles active/suspended status
func (h *AdminHandler) UpdateUserStatus(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	targetIDStr := chi.URLParam(r, "id")
	targetID, err := uuid.Parse(targetIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	if claims.UserID == targetID {
		http.Error(w, `{"error":"forbidden: cannot deactivate your own account"}`, http.StatusForbidden)
		return
	}

	var targetCurrentRole string
	err = h.db.Pool.QueryRow(r.Context(), "SELECT role FROM users WHERE id = $1", targetID).Scan(&targetCurrentRole)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	if targetCurrentRole == "superadmin" {
		http.Error(w, `{"error":"forbidden: superadmin account cannot be deactivated"}`, http.StatusForbidden)
		return
	}

	var body struct {
		IsActive bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"is_active boolean required"}`, http.StatusBadRequest)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "UPDATE users SET is_active = $1 WHERE id = $2", body.IsActive, targetID)
	if err != nil {
		http.Error(w, `{"error":"failed to update user status"}`, http.StatusInternalServerError)
		return
	}

	// Audit Log
	_, _ = h.db.Pool.Exec(r.Context(),
		"INSERT INTO audit_logs (admin_id, action, details) VALUES ($1, 'UPDATE_STATUS', json_build_object('target', $2::text, 'is_active', $3))",
		claims.UserID, targetIDStr, body.IsActive,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "is_active": body.IsActive})
}

// TerminateRoom is an instant kill switch for any active LiveKit room
func (h *AdminHandler) TerminateRoom(w http.ResponseWriter, r *http.Request) {
	roomSlug := chi.URLParam(r, "slug")
	if roomSlug == "" {
		http.Error(w, `{"error":"room slug required"}`, http.StatusBadRequest)
		return
	}

	targetSlug := roomSlug
	var foundSlug string
	_ = h.db.Pool.QueryRow(r.Context(), "SELECT call_room_id FROM call_logs WHERE id::text = $1 OR call_room_id = $1 LIMIT 1", roomSlug).Scan(&foundSlug)
	if foundSlug != "" {
		targetSlug = foundSlug
	}

	if h.livekitMgr != nil {
		_ = h.livekitMgr.DeleteRoom(r.Context(), targetSlug)
		_ = h.livekitMgr.DeleteRoom(r.Context(), roomSlug)
	}

	_, _ = h.db.Pool.Exec(r.Context(), "UPDATE call_logs SET status = 'ended', ended_at = NOW() WHERE call_room_id = $1 OR id::text = $1 OR call_room_id = $2", targetSlug, roomSlug)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "terminated", "room": targetSlug})
}

// GetConfig returns DSP / feature flag / language configurations
func (h *AdminHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	dynamic := h.configEngine.GetDynamic()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dynamic)
}

// UpdateConfig updates non-provider categories like audio_dsp and feature_flags
func (h *AdminHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	category := chi.URLParam(r, "category")
	if category == "providers" {
		http.Error(w, `{"error":"provider settings must be updated through /admin/providers"}`, http.StatusBadRequest)
		return
	}

	var body struct {
		ActiveKey string          `json:"active_key"`
		Config    json.RawMessage `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
		return
	}

	query := `
		INSERT INTO system_settings (category, active_key, config, updated_by, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (category) 
		DO UPDATE SET active_key = EXCLUDED.active_key, config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = NOW()`

	_, err := h.db.Pool.Exec(r.Context(), query, category, body.ActiveKey, body.Config, claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"failed to update setting"}`, http.StatusInternalServerError)
		return
	}

	_ = h.configEngine.LoadFromDB(r.Context())
	if h.redis != nil {
		_ = h.redis.PublishConfigReload(r.Context(), category)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "success", "category": category})
}
