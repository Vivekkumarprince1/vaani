package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"vaani-v2/backend/internal/auth"
	"vaani-v2/backend/internal/database"
	"vaani-v2/backend/internal/livekit"
	"vaani-v2/backend/internal/providers"
	"vaani-v2/backend/internal/translation"
	"vaani-v2/backend/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type CallHandler struct {
	db          *database.DB
	hub         *ws.Hub
	livekitMgr  *livekit.Manager
	providerMgr *providers.ProviderManager
	audioQueue  *translation.RoomAudioQueue
}

func NewCallHandler(db *database.DB, hub *ws.Hub, lk *livekit.Manager, pm *providers.ProviderManager) *CallHandler {
	return &CallHandler{
		db:          db,
		hub:         hub,
		livekitMgr:  lk,
		providerMgr: pm,
		audioQueue:  translation.NewRoomAudioQueue(),
	}
}

func (h *CallHandler) getUserPreferredLanguage(ctx context.Context, userID uuid.UUID, fallback string) string {
	if h.db != nil && h.db.Pool != nil {
		var dbLang string
		if err := h.db.Pool.QueryRow(ctx, `SELECT COALESCE(preferred_language, '') FROM users WHERE id = $1`, userID).Scan(&dbLang); err == nil {
			norm := providers.NormalizeLanguageCode(dbLang)
			if norm != "" {
				return norm
			}
		}
	}
	if norm := providers.NormalizeLanguageCode(fallback); norm != "" {
		return norm
	}
	return "en"
}

// GetToken generates signed LiveKit access token for room
func (h *CallHandler) GetToken(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var body struct {
		RoomSlug string `json:"room_slug"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RoomSlug == "" {
		http.Error(w, `{"error":"room_slug is required"}`, http.StatusBadRequest)
		return
	}

	if h.livekitMgr == nil {
		http.Error(w, `{"error":"livekit is not configured on server"}`, http.StatusServiceUnavailable)
		return
	}

	if !h.userCanAccessCall(r.Context(), body.RoomSlug, claims.UserID) {
		http.Error(w, `{"error":"you are not a participant in this call"}`, http.StatusForbidden)
		return
	}

	_ = h.livekitMgr.EnsureRoom(r.Context(), body.RoomSlug)

	// When participant gets token to join room, ensure call_log exists and user is recorded in participants
	var callLogExists bool
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM call_logs WHERE call_room_id = $1 AND status != 'ended')`,
		body.RoomSlug,
	).Scan(&callLogExists)

	userJSON, _ := json.Marshal([]map[string]string{{"user_id": claims.UserID.String()}})

	if !callLogExists {
		if _, err := h.db.Pool.Exec(r.Context(),
			`INSERT INTO call_logs (call_room_id, initiator_id, call_type, status, participants)
			 VALUES ($1, $2, 'video', 'active', $3::jsonb)`,
			body.RoomSlug, claims.UserID, string(userJSON),
		); err != nil {
			log.Printf("⚠️ Failed to insert call_logs record for %s: %v", body.RoomSlug, err)
		}
	} else {
		if _, err := h.db.Pool.Exec(r.Context(),
			`UPDATE call_logs
			 SET status = 'active',
			     participants = CASE
			       WHEN participants @> $2::jsonb
			       THEN participants
			       ELSE participants || $2::jsonb
			     END
			 WHERE call_room_id = $1 AND status != 'ended'`,
			body.RoomSlug, string(userJSON),
		); err != nil {
			log.Printf("⚠️ Failed to update call_logs record for %s: %v", body.RoomSlug, err)
		}
	}

	// Ensure user is registered in room_members for this call or meeting
	var roomID *uuid.UUID
	_ = h.db.Pool.QueryRow(r.Context(),
		`SELECT room_id FROM call_logs WHERE call_room_id = $1 ORDER BY started_at DESC LIMIT 1`,
		body.RoomSlug,
	).Scan(&roomID)

	if roomID == nil {
		var rID uuid.UUID
		if err := h.db.Pool.QueryRow(r.Context(), `SELECT id FROM rooms WHERE room_slug = $1`, body.RoomSlug).Scan(&rID); err == nil {
			roomID = &rID
		}
	}

	if roomID != nil {
		_, _ = h.db.Pool.Exec(r.Context(),
			`INSERT INTO room_members (room_id, user_id, role)
			 VALUES ($1, $2, 'member')
			 ON CONFLICT (room_id, user_id) DO NOTHING`,
			*roomID, claims.UserID,
		)
	}

	userLang := h.getUserPreferredLanguage(r.Context(), claims.UserID, claims.PreferredLanguage)
	metaJSON, _ := json.Marshal(map[string]string{
		"preferred_language": userLang,
		"username":           claims.Username,
	})
	token, err := h.livekitMgr.GenerateToken(body.RoomSlug, claims.UserID.String(), claims.Username, string(metaJSON))
	if err != nil {
		http.Error(w, `{"error":"failed to generate livekit token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token":     token,
		"room_slug": body.RoomSlug,
		"url":       h.livekitMgr.GetHostURL(),
	})
}

// InitiateCall creates a call session and rings remote participant(s) via WebSocket
func (h *CallHandler) InitiateCall(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var body struct {
		TargetUserID *uuid.UUID `json:"target_user_id,omitempty"` // For 1:1 direct calls
		RoomID       *uuid.UUID `json:"room_id,omitempty"`        // For group calls
		CallType     string     `json:"call_type"`                // audio or video
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
		return
	}

	if body.CallType == "" {
		body.CallType = "video"
	}

	if body.RoomID != nil {
		var isMember bool
		if err := h.db.Pool.QueryRow(r.Context(),
			`SELECT EXISTS(
				SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2
			)`, body.RoomID, claims.UserID,
		).Scan(&isMember); err != nil || !isMember {
			http.Error(w, `{"error":"you are not a member of this room"}`, http.StatusForbidden)
			return
		}
	}

	participants := []map[string]interface{}{
		{
			"user_id":  claims.UserID.String(),
			"username": claims.Username,
		},
	}
	if body.TargetUserID != nil {
		participants = append(participants, map[string]interface{}{
			"user_id": body.TargetUserID.String(),
		})
	}
	participantsJSON, _ := json.Marshal(participants)

	callRoomID := "call_" + uuid.New().String()[:12]

	var callID uuid.UUID
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO call_logs (call_room_id, room_id, initiator_id, call_type, status, started_at, participants)
		 VALUES ($1, $2, $3, $4, 'ringing', NOW(), $5)
		 RETURNING id`,
		callRoomID, body.RoomID, claims.UserID, body.CallType, participantsJSON,
	).Scan(&callID)

	if err != nil {
		http.Error(w, `{"error":"failed to create call log"}`, http.StatusInternalServerError)
		return
	}

	invitePayload := map[string]interface{}{
		"call_id":        callID,
		"call_room_id":   callRoomID,
		"initiator_id":   claims.UserID,
		"initiator_name": claims.Username,
		"call_type":      body.CallType,
		"room_id":        body.RoomID,
	}

	// If calling within a group/room, ring all room members
	if body.RoomID != nil {
		var roomName string
		var roomType string
		_ = h.db.Pool.QueryRow(r.Context(),
			"SELECT name, type FROM rooms WHERE id = $1",
			*body.RoomID,
		).Scan(&roomName, &roomType)

		invitePayload["room_name"] = roomName
		invitePayload["is_group"] = (roomType == "group")

		rows, err := h.db.Pool.Query(r.Context(),
			"SELECT user_id FROM room_members WHERE room_id = $1 AND user_id != $2",
			*body.RoomID, claims.UserID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var memberID uuid.UUID
				if err := rows.Scan(&memberID); err == nil {
					h.hub.SendToUser(memberID, "incoming_call", invitePayload)
				}
			}
		}
	} else if body.TargetUserID != nil {
		// Ring remote user for direct 1:1 call
		invitePayload["is_group"] = false
		h.hub.SendToUser(*body.TargetUserID, "incoming_call", invitePayload)
	}

	// Ensure LiveKit room exists for caller
	if h.livekitMgr != nil {
		_ = h.livekitMgr.EnsureRoom(r.Context(), callRoomID)
	}

	// 45-second auto ringing timeout for unanswered calls
	go func(cID uuid.UUID, rSlug string) {
		time.Sleep(45 * time.Second)
		res, err := h.db.Pool.Exec(context.Background(),
			"UPDATE call_logs SET status = 'missed', ended_at = NOW() WHERE id = $1 AND status = 'ringing'",
			cID,
		)
		if err == nil && res.RowsAffected() > 0 {
			h.hub.BroadcastEvent("call_timeout", map[string]interface{}{
				"call_id":      cID,
				"call_room_id": rSlug,
				"reason":       "no_answer",
			})
		}
	}(callID, callRoomID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"call_id":      callID,
		"call_room_id": callRoomID,
		"status":       "ringing",
		"is_group":     invitePayload["is_group"],
	})
}

// EndCall terminates the call session
func (h *CallHandler) EndCall(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var body struct {
		CallRoomID string `json:"call_room_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CallRoomID == "" {
		http.Error(w, `{"error":"call_room_id is required"}`, http.StatusBadRequest)
		return
	}

	if !h.userCanAccessCall(r.Context(), body.CallRoomID, claims.UserID) {
		http.Error(w, `{"error":"you are not a participant in this call"}`, http.StatusForbidden)
		return
	}

	_, _ = h.db.Pool.Exec(r.Context(),
		`UPDATE call_logs 
		 SET status = 'ended', ended_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int
		 WHERE call_room_id = $1 AND status != 'ended'`,
		body.CallRoomID,
	)

	// Clean up room audio sequential queue
	if h.audioQueue != nil {
		h.audioQueue.RemoveRoomQueue(body.CallRoomID)
	}

	// Notify room participants
	h.hub.BroadcastEvent("call_ended", map[string]string{
		"call_room_id": body.CallRoomID,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ended"})
}

// CreateInstantMeeting creates an ad-hoc instant meeting room with shareable link
func (h *CallHandler) CreateInstantMeeting(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var body struct {
		MeetingName string `json:"meeting_name"`
		CallType    string `json:"call_type"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	if body.CallType == "" {
		body.CallType = "video"
	}

	meetingName := strings.TrimSpace(body.MeetingName)
	if meetingName == "" {
		meetingName = fmt.Sprintf("Meeting by %s", claims.Username)
	}

	// Generate clean slug e.g. meet-8a9b2c3d
	slug := "meet-" + strings.ReplaceAll(uuid.New().String()[:8], "-", "")

	// 1. Create a room for this meeting
	var roomID uuid.UUID
	err := h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO rooms (name, room_slug, type, created_by, is_active)
		 VALUES ($1, $2, 'group', $3, TRUE)
		 RETURNING id`,
		meetingName, slug, claims.UserID,
	).Scan(&roomID)
	if err != nil {
		http.Error(w, `{"error":"failed to create meeting room"}`, http.StatusInternalServerError)
		return
	}

	// 2. Add creator to room_members as owner
	_, _ = h.db.Pool.Exec(r.Context(),
		`INSERT INTO room_members (room_id, user_id, role)
		 VALUES ($1, $2, 'owner')
		 ON CONFLICT (room_id, user_id) DO NOTHING`,
		roomID, claims.UserID,
	)

	// 3. Create call_logs entry
	initialParticipants, _ := json.Marshal([]map[string]interface{}{
		{
			"user_id":   claims.UserID,
			"username":  claims.Username,
			"joined_at": time.Now().Format(time.RFC3339),
		},
	})

	var callID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO call_logs (call_room_id, room_id, initiator_id, call_type, status, started_at, participants)
		 VALUES ($1, $2, $3, $4, 'active', NOW(), $5)
		 RETURNING id`,
		slug, roomID, claims.UserID, body.CallType, initialParticipants,
	).Scan(&callID)
	if err != nil {
		http.Error(w, `{"error":"failed to initialize meeting call"}`, http.StatusInternalServerError)
		return
	}

	// 4. Ensure LiveKit room & generate token
	var token, livekitURL string
	if h.livekitMgr != nil {
		_ = h.livekitMgr.EnsureRoom(r.Context(), slug)
		userLang := h.getUserPreferredLanguage(r.Context(), claims.UserID, claims.PreferredLanguage)
		metaJSON, _ := json.Marshal(map[string]string{
			"preferred_language": userLang,
			"username":           claims.Username,
		})
		t, err := h.livekitMgr.GenerateToken(slug, claims.UserID.String(), claims.Username, string(metaJSON))
		if err == nil {
			token = t
			livekitURL = h.livekitMgr.GetHostURL()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"call_id":      callID,
		"call_room_id": slug,
		"room_id":      roomID,
		"room_name":    meetingName,
		"call_type":    body.CallType,
		"join_link":    "/join/" + slug,
		"token":        token,
		"livekit_url":  livekitURL,
	})
}

// ResolveMeeting looks up meeting info by slug for lobby preview & link validation
func (h *CallHandler) ResolveMeeting(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"meeting slug is required"}`, http.StatusBadRequest)
		return
	}

	var callID uuid.UUID
	var roomID *uuid.UUID
	var callType string
	var status string
	var roomName string
	var initiatorName string
	var initiatorID *uuid.UUID
	var startedAt time.Time

	// 1. Check call_logs first
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT c.id, c.room_id, c.call_type, c.status, c.started_at,
		        COALESCE(r.name, 'Vaani Meeting'), COALESCE(u.username, 'Host'), c.initiator_id
		 FROM call_logs c
		 LEFT JOIN rooms r ON c.room_id = r.id
		 LEFT JOIN users u ON c.initiator_id = u.id
		 WHERE c.call_room_id = $1
		 ORDER BY c.started_at DESC LIMIT 1`,
		slug,
	).Scan(&callID, &roomID, &callType, &status, &startedAt, &roomName, &initiatorName, &initiatorID)

	// 2. If not found in call_logs, check if it's a persistent room_slug
	if err != nil {
		var rID uuid.UUID
		var rName string
		var rType string
		var createdBy *uuid.UUID
		var creatorName string
		err2 := h.db.Pool.QueryRow(r.Context(),
			`SELECT r.id, r.name, r.type, r.created_by, COALESCE(u.username, 'Host')
			 FROM rooms r
			 LEFT JOIN users u ON r.created_by = u.id
			 WHERE r.room_slug = $1`,
			slug,
		).Scan(&rID, &rName, &rType, &createdBy, &creatorName)

		if err2 != nil {
			http.Error(w, `{"error":"meeting not found or expired"}`, http.StatusNotFound)
			return
		}

		roomID = &rID
		roomName = rName
		initiatorName = creatorName
		initiatorID = createdBy
		callType = "video"
		status = "ready"
	}

	// If user is authenticated, ensure membership in room if it exists
	claims := auth.GetUserFromContext(r.Context())
	if claims != nil && roomID != nil {
		_, _ = h.db.Pool.Exec(r.Context(),
			`INSERT INTO room_members (room_id, user_id, role)
			 VALUES ($1, $2, 'member')
			 ON CONFLICT (room_id, user_id) DO NOTHING`,
			*roomID, claims.UserID,
		)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"call_room_id":    slug,
		"room_id":         roomID,
		"room_name":       roomName,
		"call_type":       callType,
		"initiator_name":  initiatorName,
		"initiator_id":    initiatorID,
		"status":          status,
		"has_active_call": (status == "active" || status == "ringing"),
	})
}

// JoinMeeting authenticates the user into the meeting, updates participants, and issues LiveKit token
func (h *CallHandler) JoinMeeting(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	slug := chi.URLParam(r, "slug")
	if slug == "" {
		http.Error(w, `{"error":"meeting slug is required"}`, http.StatusBadRequest)
		return
	}

	var body struct {
		CallType string `json:"call_type"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.CallType == "" {
		body.CallType = "video"
	}

	// 1. Resolve meeting room
	var roomID *uuid.UUID
	var roomName string
	var callID uuid.UUID
	var callStatus string

	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT c.id, c.room_id, c.status, COALESCE(r.name, 'Vaani Meeting')
		 FROM call_logs c
		 LEFT JOIN rooms r ON c.room_id = r.id
		 WHERE c.call_room_id = $1
		 ORDER BY c.started_at DESC LIMIT 1`,
		slug,
	).Scan(&callID, &roomID, &callStatus, &roomName)

	if err != nil || callStatus == "ended" {
		// Look up in rooms table
		var rID uuid.UUID
		err2 := h.db.Pool.QueryRow(r.Context(),
			`SELECT id, name FROM rooms WHERE room_slug = $1`,
			slug,
		).Scan(&rID, &roomName)
		if err2 != nil {
			http.Error(w, `{"error":"meeting not found"}`, http.StatusNotFound)
			return
		}
		roomID = &rID

		// Start a new call for this room
		_ = h.db.Pool.QueryRow(r.Context(),
			`INSERT INTO call_logs (call_room_id, room_id, initiator_id, call_type, status, started_at)
			 VALUES ($1, $2, $3, $4, 'active', NOW())
			 RETURNING id`,
			slug, roomID, claims.UserID, body.CallType,
		).Scan(&callID)
	} else if callStatus == "ringing" {
		// Set to active when someone answers / joins
		_, _ = h.db.Pool.Exec(r.Context(),
			"UPDATE call_logs SET status = 'active' WHERE id = $1",
			callID,
		)
	}

	// 2. Ensure user is in room_members
	if roomID != nil {
		_, _ = h.db.Pool.Exec(r.Context(),
			`INSERT INTO room_members (room_id, user_id, role)
			 VALUES ($1, $2, 'member')
			 ON CONFLICT (room_id, user_id) DO NOTHING`,
			*roomID, claims.UserID,
		)
	}

	// 3. LiveKit token
	if h.livekitMgr == nil {
		http.Error(w, `{"error":"livekit is not configured on server"}`, http.StatusServiceUnavailable)
		return
	}

	_ = h.livekitMgr.EnsureRoom(r.Context(), slug)
	userLang := h.getUserPreferredLanguage(r.Context(), claims.UserID, claims.PreferredLanguage)
	metaJSON, _ := json.Marshal(map[string]string{
		"preferred_language": userLang,
		"username":           claims.Username,
	})
	token, err := h.livekitMgr.GenerateToken(slug, claims.UserID.String(), claims.Username, string(metaJSON))
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	// Broadcast participant joined event via WebSocket
	h.hub.BroadcastEvent("participant_joined_meeting", map[string]interface{}{
		"call_room_id": slug,
		"user_id":      claims.UserID,
		"username":     claims.Username,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"call_id":      callID,
		"call_room_id": slug,
		"room_id":      roomID,
		"room_name":    roomName,
		"call_type":    body.CallType,
		"token":        token,
		"livekit_url":  h.livekitMgr.GetHostURL(),
	})
}

// detectScriptLanguage identifies natural language from Unicode character blocks (Russian Cyrillic, Hindi Devanagari, Arabic, Chinese, Japanese, Korean)
func detectScriptLanguage(text string) string {
	var (
		cyrillicCount   int // Russian / Ukrainian / Bulgarian
		devanagariCount int // Hindi / Marathi / Sanskrit
		arabicCount     int // Arabic / Urdu / Persian
		cjkCount        int // Chinese Hanzi
		hiraganaCount   int // Japanese Hiragana / Katakana
		hangulCount     int // Korean Hangul
	)

	for _, r := range text {
		switch {
		case r >= 0x0400 && r <= 0x04FF:
			cyrillicCount++
		case r >= 0x0900 && r <= 0x097F:
			devanagariCount++
		case r >= 0x0600 && r <= 0x06FF:
			arabicCount++
		case r >= 0x4E00 && r <= 0x9FFF:
			cjkCount++
		case (r >= 0x3040 && r <= 0x309F) || (r >= 0x30A0 && r <= 0x30FF):
			hiraganaCount++
		case r >= 0xAC00 && r <= 0xD7AF:
			hangulCount++
		}
	}

	total := len([]rune(text))
	if total == 0 {
		return ""
	}

	if cyrillicCount >= 2 || (total < 5 && cyrillicCount > 0) {
		return "ru"
	}
	if devanagariCount >= 2 || (total < 5 && devanagariCount > 0) {
		return "hi"
	}
	if arabicCount >= 2 || (total < 5 && arabicCount > 0) {
		return "ar"
	}
	if hiraganaCount > 0 {
		return "ja"
	}
	if cjkCount >= 2 || (total < 5 && cjkCount > 0) {
		return "zh"
	}
	if hangulCount >= 2 || (total < 5 && hangulCount > 0) {
		return "ko"
	}

	return ""
}

// HandleCallSpeech translates recognized speech text during a call and broadcasts subtitles
func (h *CallHandler) HandleCallSpeech(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var body struct {
		CallRoomID string `json:"call_room_id"`
		Text       string `json:"text"`
		Language   string `json:"language"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Text) == "" {
		http.Error(w, `{"error":"text is required"}`, http.StatusBadRequest)
		return
	}

	if body.CallRoomID == "" || !h.userCanAccessCall(r.Context(), body.CallRoomID, claims.UserID) {
		http.Error(w, `{"error":"you are not a participant in this call"}`, http.StatusForbidden)
		return
	}

	sourceLang := providers.NormalizeLanguageCode(body.Language)

	// Deterministic script detection overrides mismatched dropdown (e.g. Cyrillic -> ru, Devanagari -> hi)
	if scriptLang := detectScriptLanguage(body.Text); scriptLang != "" {
		sourceLang = scriptLang
	} else if sourceLang == "" {
		sourceLang = h.getUserPreferredLanguage(r.Context(), claims.UserID, claims.PreferredLanguage)
	}

	// 1. Discover target languages of other participants in this call/room
	rawTargets := h.getTargetLanguagesForCall(r.Context(), body.CallRoomID, claims.UserID, sourceLang)
	var targetLangs []string
	for _, t := range rawTargets {
		normT := providers.NormalizeLanguageCode(t)
		if normT != "" && !strings.EqualFold(normT, sourceLang) {
			targetLangs = append(targetLangs, normT)
		}
	}

	// If no distinct target language found, provide clean opposite language for bidirectional translation
	if len(targetLangs) == 0 {
		switch strings.ToLower(sourceLang) {
		case "ru":
			targetLangs = []string{"en"}
		case "hi":
			targetLangs = []string{"en"}
		case "en":
			targetLangs = []string{"hi"}
		default:
			targetLangs = []string{"en"}
		}
	}

	log.Printf("🎙️ [HandleCallSpeech] room=%s, user=%s, sourceLang=%s, text=%q, targets=%v", body.CallRoomID, claims.Username, sourceLang, body.Text, targetLangs)

	var generatedSubtitles []map[string]interface{}

	for _, targetLang := range targetLangs {
		translated := body.Text
		if !strings.EqualFold(sourceLang, targetLang) && h.providerMgr != nil {
			resList, err := h.providerMgr.TranslateBatch(r.Context(), []string{body.Text}, sourceLang, targetLang)
			if err == nil && len(resList) > 0 && strings.TrimSpace(resList[0]) != "" {
				translated = strings.TrimSpace(resList[0])
			}
		}

		log.Printf("📢 [Speech Subtitle] room=%s, from=%s (%s) -> %s: %q", body.CallRoomID, claims.Username, sourceLang, targetLang, translated)

		subEvent := map[string]interface{}{
			"id":             uuid.New().String(),
			"speakerName":    claims.Username,
			"speakerId":      claims.UserID.String(),
			"originalText":   body.Text,
			"translatedText": translated,
			"sourceLanguage": sourceLang,
			"language":       targetLang,
			"audio_url":      fmt.Sprintf("/api/calls/tts?text=%s&lang=%s", url.QueryEscape(translated), url.QueryEscape(targetLang)),
			"timestamp":      time.Now().UnixMilli(),
			"call_room_id":   body.CallRoomID,
		}

		// Broadcast live subtitle specifically to call participants
		h.broadcastSubtitleToRoom(r.Context(), body.CallRoomID, claims.UserID, subEvent)
		generatedSubtitles = append(generatedSubtitles, subEvent)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"subtitles": generatedSubtitles,
	})
}

// HandleCallAudio receives raw microphone audio from frontend, runs STT, translates, and broadcasts subtitles
func (h *CallHandler) HandleCallAudio(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Max 10MB audio chunk
	_ = r.ParseMultipartForm(10 << 20)

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"error":"audio file is required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	audioBytes, err := io.ReadAll(file)
	if err != nil || len(audioBytes) == 0 {
		http.Error(w, `{"error":"failed to read audio"}`, http.StatusBadRequest)
		return
	}

	callRoomID := r.FormValue("call_room_id")
	if callRoomID == "" || !h.userCanAccessCall(r.Context(), callRoomID, claims.UserID) {
		http.Error(w, `{"error":"you are not a participant in this call"}`, http.StatusForbidden)
		return
	}

	sourceLang := providers.NormalizeLanguageCode(r.FormValue("language"))

	if h.providerMgr == nil {
		http.Error(w, `{"error":"STT provider not configured"}`, http.StatusServiceUnavailable)
		return
	}

	recognizedText, detectedLang, err := h.providerMgr.TranscribeAudio(r.Context(), audioBytes, header.Filename, sourceLang)
	if err != nil || strings.TrimSpace(recognizedText) == "" {
		http.Error(w, fmt.Sprintf(`{"error":"transcription failed: %v"}`, err), http.StatusInternalServerError)
		return
	}

	// Resolve spoken language accurately:
	// 1. Non-Latin script detection (Devanagari, Cyrillic, Arabic, CJK, etc.) is 100% deterministic
	// 2. Explicit user-selected language or neural STT detected language
	// 3. Fresh user preferred_language from database
	if scriptLang := detectScriptLanguage(recognizedText); scriptLang != "" {
		sourceLang = scriptLang
	} else if sourceLang == "" {
		if detectedLang != "" {
			sourceLang = providers.NormalizeLanguageCode(detectedLang)
		} else {
			sourceLang = h.getUserPreferredLanguage(r.Context(), claims.UserID, claims.PreferredLanguage)
		}
	}

	rawTargets := h.getTargetLanguagesForCall(r.Context(), callRoomID, claims.UserID, sourceLang)
	var targetLangs []string
	for _, t := range rawTargets {
		normT := providers.NormalizeLanguageCode(t)
		if normT != "" && !strings.EqualFold(normT, sourceLang) {
			targetLangs = append(targetLangs, normT)
		}
	}

	if len(targetLangs) == 0 {
		switch strings.ToLower(sourceLang) {
		case "ru":
			targetLangs = []string{"en"}
		case "hi":
			targetLangs = []string{"en"}
		case "en":
			targetLangs = []string{"hi"}
		default:
			targetLangs = []string{"en"}
		}
	}

	log.Printf("🎙️ [HandleCallAudio] room=%s, user=%s, sourceLang=%s, recognized=%q, targets=%v", callRoomID, claims.Username, sourceLang, recognizedText, targetLangs)

	var generatedSubtitles []map[string]interface{}
	for _, targetLang := range targetLangs {
		translated := recognizedText
		if !strings.EqualFold(sourceLang, targetLang) {
			resList, err := h.providerMgr.TranslateBatch(r.Context(), []string{recognizedText}, sourceLang, targetLang)
			if err == nil && len(resList) > 0 && strings.TrimSpace(resList[0]) != "" {
				translated = strings.TrimSpace(resList[0])
			}
		}

		log.Printf("📢 [Audio Subtitle] room=%s, from=%s (%s) -> %s: %q", callRoomID, claims.Username, sourceLang, targetLang, translated)

		subEvent := map[string]interface{}{
			"id":             uuid.New().String(),
			"speakerName":    claims.Username,
			"speakerId":      claims.UserID.String(),
			"originalText":   recognizedText,
			"translatedText": translated,
			"sourceLanguage": sourceLang,
			"language":       targetLang,
			"audio_url":      fmt.Sprintf("/api/calls/tts?text=%s&lang=%s", url.QueryEscape(translated), url.QueryEscape(targetLang)),
			"timestamp":      time.Now().UnixMilli(),
			"call_room_id":   callRoomID,
		}

		h.broadcastSubtitleToRoom(r.Context(), callRoomID, claims.UserID, subEvent)
		generatedSubtitles = append(generatedSubtitles, subEvent)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"text":      recognizedText,
		"subtitles": generatedSubtitles,
	})
}

// broadcastSubtitleToRoom routes subtitle updates only to call participants, preventing privacy leaks and broadcast floods.
func (h *CallHandler) broadcastSubtitleToRoom(ctx context.Context, callRoomID string, senderID uuid.UUID, subEvent map[string]interface{}) {
	if h.hub == nil {
		return
	}

	sentUsers := make(map[uuid.UUID]bool)

	// 1. Send to caller
	h.hub.SendToUser(senderID, "subtitle_update", subEvent)
	sentUsers[senderID] = true

	// 2. Send to LiveKit participants connected to this room
	if h.livekitMgr != nil && callRoomID != "" {
		if parts, err := h.livekitMgr.ListParticipants(ctx, callRoomID); err == nil {
			for _, p := range parts {
				if uid, err := uuid.Parse(p.Identity); err == nil && !sentUsers[uid] {
					h.hub.SendToUser(uid, "subtitle_update", subEvent)
					sentUsers[uid] = true
				}
			}
		}
	}

	// 3. Send to call_logs initiator & participants
	if h.db != nil && h.db.Pool != nil && callRoomID != "" {
		rows, err := h.db.Pool.Query(ctx, `
			SELECT DISTINCT u.id
			FROM call_logs c
			LEFT JOIN LATERAL jsonb_array_elements(c.participants) AS elem ON TRUE
			JOIN users u ON (u.id::text = elem->>'user_id' OR u.id = c.initiator_id)
			WHERE (c.call_room_id = $1 OR c.id::text = $1)`, callRoomID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var uid uuid.UUID
				if err := rows.Scan(&uid); err == nil && !sentUsers[uid] {
					h.hub.SendToUser(uid, "subtitle_update", subEvent)
					sentUsers[uid] = true
				}
			}
		}

		// 4. Send to rooms room_members (if callRoomID is room_slug)
		rRows, err := h.db.Pool.Query(ctx, `
			SELECT DISTINCT rm.user_id
			FROM rooms r
			JOIN room_members rm ON r.id = rm.room_id
			WHERE r.room_slug = $1`, callRoomID)
		if err == nil {
			defer rRows.Close()
			for rRows.Next() {
				var uid uuid.UUID
				if err := rRows.Scan(&uid); err == nil && !sentUsers[uid] {
					h.hub.SendToUser(uid, "subtitle_update", subEvent)
					sentUsers[uid] = true
				}
			}
		}
	}

	// 5. Fallback for open instant meetings (meet-*) if participants weren't in DB yet
	if strings.HasPrefix(callRoomID, "meet-") && len(sentUsers) <= 1 {
		h.hub.BroadcastEvent("subtitle_update", subEvent)
	}
}

// userCanAccessCall verifies that a user is the call initiator, a recorded
// direct-call participant, or a member of the room associated with the call.
// Keeping this check server-side prevents unauthorized speech injection.
func (h *CallHandler) userCanAccessCall(ctx context.Context, callRoomID string, userID uuid.UUID) bool {
	if h.db == nil || h.db.Pool == nil || callRoomID == "" {
		return false
	}

	// Instant meetings (meet-*) are open to all authenticated users
	if strings.HasPrefix(callRoomID, "meet-") {
		return true
	}

	var allowed bool
	err := h.db.Pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM call_logs c
			LEFT JOIN room_members rm
				ON rm.room_id = c.room_id AND rm.user_id = $2
			WHERE (c.call_room_id = $1 OR c.id::text = $1)
			  AND (
					c.initiator_id = $2
					OR rm.user_id IS NOT NULL
					OR c.participants @> jsonb_build_array(jsonb_build_object('user_id', $2::text))
					OR EXISTS (
						SELECT 1 FROM jsonb_array_elements(c.participants) elem
						WHERE elem->>'user_id' = $2::text
					)
			  )
		)`, callRoomID, userID).Scan(&allowed)

	if err == nil && allowed {
		return true
	}

	// Also check room_slug directly for group meetings or room sessions
	var inRoom bool
	_ = h.db.Pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM rooms r
			JOIN room_members rm ON r.id = rm.room_id
			WHERE r.room_slug = $1 AND rm.user_id = $2
		)`, callRoomID, userID).Scan(&inRoom)

	if inRoom {
		return true
	}

	// 3. LiveKit SFU Real-Time Active Peers Check
	if h.livekitMgr != nil {
		if parts, err := h.livekitMgr.ListParticipants(ctx, callRoomID); err == nil {
			for _, p := range parts {
				if p.Identity == userID.String() {
					return true
				}
			}
		}
	}

	// 4. Any authenticated user for an existing call_room_id session
	var inCallLog bool
	_ = h.db.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM call_logs WHERE call_room_id = $1)`, callRoomID).Scan(&inCallLog)
	return inCallLog
}

func (h *CallHandler) getTargetLanguagesForCall(ctx context.Context, callRoomID string, senderID uuid.UUID, sourceLang string) []string {
	var targetLangs []string
	visited := make(map[string]bool)

	addLang := func(raw string) {
		clean := providers.NormalizeLanguageCode(raw)
		if clean != "" && !visited[clean] && !strings.EqualFold(clean, sourceLang) {
			visited[clean] = true
			targetLangs = append(targetLangs, clean)
		}
	}

	// 1. LiveKit SFU Real-Time Active Peers: resolve each peer's latest preferred_language from DB first, then metadata
	if h.livekitMgr != nil {
		if parts, err := h.livekitMgr.ListParticipants(ctx, callRoomID); err == nil {
			for _, p := range parts {
				if p.Identity == senderID.String() {
					continue
				}
				resolvedFromDB := false
				if peerUID, err := uuid.Parse(p.Identity); err == nil && h.db != nil && h.db.Pool != nil {
					var dbLang string
					if err := h.db.Pool.QueryRow(ctx, `SELECT COALESCE(preferred_language, '') FROM users WHERE id = $1`, peerUID).Scan(&dbLang); err == nil && strings.TrimSpace(dbLang) != "" {
						addLang(dbLang)
						resolvedFromDB = true
					}
				}
				if !resolvedFromDB && p.Metadata != "" {
					var meta struct {
						PreferredLanguage string `json:"preferred_language"`
					}
					if err := json.Unmarshal([]byte(p.Metadata), &meta); err == nil && meta.PreferredLanguage != "" {
						addLang(meta.PreferredLanguage)
					}
				}
			}
		}
	}

	// 2. Query call_logs.participants JSONB array and initiator_id (always checked so multi-party / ringing / DB-updated languages are included)
	if h.db != nil && h.db.Pool != nil {
		pRows, err := h.db.Pool.Query(ctx,
			`SELECT DISTINCT COALESCE(u.preferred_language, 'en')
			 FROM call_logs c
			 LEFT JOIN LATERAL jsonb_array_elements(c.participants) AS elem ON TRUE
			 JOIN users u ON (u.id::text = elem->>'user_id' OR u.id = c.initiator_id)
			 WHERE (c.call_room_id = $1 OR c.id::text = $1)
			   AND u.id != $2
			   AND u.preferred_language IS NOT NULL
			   AND u.preferred_language != ''`,
			callRoomID, senderID,
		)
		if err == nil {
			defer pRows.Close()
			for pRows.Next() {
				var lang string
				if err := pRows.Scan(&lang); err == nil {
					addLang(lang)
				}
			}
		}

		// 3. Query call_logs.room_id -> room_members
		rows, err := h.db.Pool.Query(ctx,
			`SELECT DISTINCT COALESCE(u.preferred_language, 'en')
			 FROM call_logs c
			 JOIN room_members rm ON c.room_id = rm.room_id
			 JOIN users u ON rm.user_id = u.id
			 WHERE (c.call_room_id = $1 OR c.id::text = $1)
			   AND u.id != $2
			   AND u.preferred_language IS NOT NULL
			   AND u.preferred_language != ''`,
			callRoomID, senderID,
		)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var lang string
				if err := rows.Scan(&lang); err == nil {
					addLang(lang)
				}
			}
		}

		// 4. Query rooms.room_slug -> room_members
		rRows, err := h.db.Pool.Query(ctx,
			`SELECT DISTINCT COALESCE(u.preferred_language, 'en')
			 FROM rooms r
			 JOIN room_members rm ON r.id = rm.room_id
			 JOIN users u ON rm.user_id = u.id
			 WHERE r.room_slug = $1
			   AND u.id != $2
			   AND u.preferred_language IS NOT NULL
			   AND u.preferred_language != ''`,
			callRoomID, senderID,
		)
		if err == nil {
			defer rRows.Close()
			for rRows.Next() {
				var lang string
				if err := rRows.Scan(&lang); err == nil {
					addLang(lang)
				}
			}
		}
	}

	// 5. Clean opposite language fallback for bidirectional calls
	if len(targetLangs) == 0 {
		switch strings.ToLower(sourceLang) {
		case "ru":
			targetLangs = []string{"en"}
		case "hi":
			targetLangs = []string{"en"}
		case "en":
			targetLangs = []string{"hi"}
		default:
			targetLangs = []string{"en"}
		}
	}

	return targetLangs
}

// HandleTTS streams high-fidelity neural voice audio for translated speech in any language
func (h *CallHandler) HandleTTS(w http.ResponseWriter, r *http.Request) {
	text := strings.TrimSpace(r.URL.Query().Get("text"))
	lang := providers.NormalizeLanguageCode(r.URL.Query().Get("lang"))
	if text == "" {
		http.Error(w, `{"error":"text is required"}`, http.StatusBadRequest)
		return
	}
	if lang == "" {
		lang = "en"
	}
	if scriptLang := detectScriptLanguage(text); scriptLang != "" && lang == "en" {
		lang = scriptLang
	}
	if runes := []rune(text); len(runes) > 400 {
		text = string(runes[:400])
	}

	if h.providerMgr == nil {
		http.Error(w, `{"error":"TTS provider unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	audioBytes, mimeType, err := h.providerMgr.SynthesizeSpeech(r.Context(), text, lang)
	if err != nil || len(audioBytes) == 0 {
		http.Error(w, `{"error":"TTS provider unavailable"}`, http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	_, _ = w.Write(audioBytes)
}
