package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"vaani-v2/backend/internal/auth"
	"vaani-v2/backend/internal/database"
	"vaani-v2/backend/internal/domain"
	"vaani-v2/backend/internal/providers"
	"vaani-v2/backend/internal/translation"
	"vaani-v2/backend/internal/ws"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type ChatHandler struct {
	db          *database.DB
	hub         *ws.Hub
	providerMgr *providers.ProviderManager
	transQueue  *translation.TranslationQueue
}

func NewChatHandler(db *database.DB, hub *ws.Hub, pm *providers.ProviderManager) *ChatHandler {
	var tq *translation.TranslationQueue
	if pm != nil {
		tq = translation.NewTranslationQueue(db, hub, pm.GetCache(), pm, 10, 10000)
	}
	return &ChatHandler{
		db:          db,
		hub:         hub,
		providerMgr: pm,
		transQueue:  tq,
	}
}

// ListRooms returns all direct chats and groups user is part of with rich member info
func (h *ChatHandler) ListRooms(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	query := `
		SELECT 
			r.id, 
			COALESCE(r.name, ''), 
			r.room_slug, 
			r.type, 
			rm.role,
			(SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count,
			r.created_by,
			r.created_at, 
			r.updated_at,
			(SELECT original_text FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_message,
			other_u.id,
			other_u.username,
			other_u.email,
			other_u.preferred_language,
			other_u.status,
			other_u.avatar_url
		FROM rooms r
		JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = $1
		LEFT JOIN LATERAL (
			SELECT u.id, u.username, u.email, u.preferred_language, u.status, u.avatar_url
			FROM room_members other_rm
			JOIN users u ON u.id = other_rm.user_id
			WHERE other_rm.room_id = r.id AND other_rm.user_id != $1
			LIMIT 1
		) other_u ON r.type = 'direct'
		WHERE r.is_active = TRUE
		ORDER BY r.updated_at DESC`

	rows, err := h.db.Pool.Query(r.Context(), query, claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch rooms"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	rooms := make([]domain.RoomDetail, 0)
	for rows.Next() {
		var rd domain.RoomDetail
		var otherID *uuid.UUID
		var otherUsername, otherEmail, otherLang, otherStatus, otherAvatar *string
		var lastMsg *string

		err := rows.Scan(
			&rd.ID,
			&rd.Name,
			&rd.RoomSlug,
			&rd.Type,
			&rd.Role,
			&rd.MemberCount,
			&rd.CreatedBy,
			&rd.CreatedAt,
			&rd.UpdatedAt,
			&lastMsg,
			&otherID,
			&otherUsername,
			&otherEmail,
			&otherLang,
			&otherStatus,
			&otherAvatar,
		)
		if err != nil {
			continue
		}

		rd.LastMessage = lastMsg
		if otherID != nil && otherUsername != nil {
			status := *otherStatus
			if h.hub != nil && h.hub.IsOnline(*otherID) {
				status = domain.StatusOnline
			} else {
				status = domain.StatusOffline
			}
			rd.OtherUser = &domain.UserSummary{
				ID:                *otherID,
				Username:          *otherUsername,
				Email:             *otherEmail,
				PreferredLanguage: *otherLang,
				Status:            status,
				AvatarURL:         otherAvatar,
			}
			if rd.Type == "direct" {
				rd.Name = *otherUsername
			}
		}

		rooms = append(rooms, rd)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rooms)
}

// CreateRoom creates a 1:1 direct chat or a group room
func (h *ChatHandler) CreateRoom(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	var body struct {
		Name           string      `json:"name"`
		Type           string      `json:"type"` // direct or group
		ParticipantIDs []uuid.UUID `json:"participant_ids"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
		return
	}

	if body.Type == "" {
		body.Type = "direct"
	}

	// For direct chat, check if a direct room already exists between the two users
	if body.Type == "direct" && len(body.ParticipantIDs) > 0 {
		targetID := body.ParticipantIDs[0]
		var existingID uuid.UUID
		var existingSlug, existingName string
		err := h.db.Pool.QueryRow(r.Context(), `
			SELECT r.id, r.room_slug, r.name
			FROM rooms r
			JOIN room_members rm1 ON rm1.room_id = r.id AND rm1.user_id = $1
			JOIN room_members rm2 ON rm2.room_id = r.id AND rm2.user_id = $2
			WHERE r.type = 'direct' AND r.is_active = TRUE
			LIMIT 1`,
			claims.UserID, targetID,
		).Scan(&existingID, &existingSlug, &existingName)

		if err == nil {
			var otherUser *domain.UserSummary
			var oID uuid.UUID
			var oUsername, oEmail, oLang, oStatus string
			var oAvatar *string
			if oErr := h.db.Pool.QueryRow(r.Context(),
				"SELECT id, username, email, preferred_language, status, avatar_url FROM users WHERE id = $1",
				targetID,
			).Scan(&oID, &oUsername, &oEmail, &oLang, &oStatus, &oAvatar); oErr == nil {
				otherUser = &domain.UserSummary{
					ID:                oID,
					Username:          oUsername,
					Email:             oEmail,
					PreferredLanguage: oLang,
					Status:            oStatus,
					AvatarURL:         oAvatar,
				}
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"id":         existingID,
				"room_slug":  existingSlug,
				"name":       body.Name,
				"type":       "direct",
				"other_user": otherUser,
			})
			return
		}
	}

	if body.Type == "group" && body.Name == "" {
		body.Name = "New Group"
	}

	roomSlug := "room_" + uuid.New().String()[:8]
	var roomID uuid.UUID

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		http.Error(w, `{"error":"transaction error"}`, http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	err = tx.QueryRow(r.Context(),
		`INSERT INTO rooms (name, room_slug, type, created_by)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		body.Name, roomSlug, body.Type, claims.UserID,
	).Scan(&roomID)
	if err != nil {
		http.Error(w, `{"error":"failed to create room"}`, http.StatusInternalServerError)
		return
	}

	// Add creator as owner
	_, _ = tx.Exec(r.Context(),
		`INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'owner')`,
		roomID, claims.UserID,
	)

	// Add participants as members
	for _, pID := range body.ParticipantIDs {
		if pID != claims.UserID {
			_, _ = tx.Exec(r.Context(),
				`INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
				roomID, pID,
			)
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, `{"error":"commit failed"}`, http.StatusInternalServerError)
		return
	}

	var otherUser *domain.UserSummary
	if body.Type == "direct" && len(body.ParticipantIDs) > 0 {
		targetID := body.ParticipantIDs[0]
		var oID uuid.UUID
		var oUsername, oEmail, oLang, oStatus string
		var oAvatar *string
		if oErr := h.db.Pool.QueryRow(r.Context(),
			"SELECT id, username, email, preferred_language, status, avatar_url FROM users WHERE id = $1",
			targetID,
		).Scan(&oID, &oUsername, &oEmail, &oLang, &oStatus, &oAvatar); oErr == nil {
			otherUser = &domain.UserSummary{
				ID:                oID,
				Username:          oUsername,
				Email:             oEmail,
				PreferredLanguage: oLang,
				Status:            oStatus,
				AvatarURL:         oAvatar,
			}
		}
	}

	// Notify invited participants via WebSocket
	roomCreatedPayload := map[string]interface{}{
		"id":         roomID,
		"room_slug":  roomSlug,
		"name":       body.Name,
		"type":       body.Type,
		"other_user": otherUser,
	}
	for _, pID := range body.ParticipantIDs {
		if pID != claims.UserID {
			h.hub.SendToUser(pID, "room_created", roomCreatedPayload)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(roomCreatedPayload)
}

// GetRoomMembers returns all members of a group or direct room
func (h *ChatHandler) GetRoomMembers(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	roomIDStr := chi.URLParam(r, "id")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	// Verify requester is in the room
	var isMember bool
	_ = h.db.Pool.QueryRow(r.Context(),
		"SELECT EXISTS(SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)",
		roomID, claims.UserID,
	).Scan(&isMember)
	if !isMember {
		http.Error(w, `{"error":"not authorized to view room members"}`, http.StatusForbidden)
		return
	}

	query := `
		SELECT rm.room_id, rm.user_id, u.username, u.email, rm.role, u.preferred_language, u.status, u.avatar_url, rm.joined_at
		FROM room_members rm
		JOIN users u ON u.id = rm.user_id
		WHERE rm.room_id = $1
		ORDER BY 
			CASE rm.role 
				WHEN 'owner' THEN 1 
				WHEN 'admin' THEN 2 
				ELSE 3 
			END, 
			rm.joined_at ASC`

	rows, err := h.db.Pool.Query(r.Context(), query, roomID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch members"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	members := make([]domain.RoomMemberDetail, 0)
	for rows.Next() {
		var m domain.RoomMemberDetail
		if err := rows.Scan(&m.RoomID, &m.UserID, &m.Username, &m.Email, &m.Role, &m.PreferredLanguage, &m.Status, &m.AvatarURL, &m.JoinedAt); err == nil {
			if h.hub != nil {
				if h.hub.IsOnline(m.UserID) {
					m.Status = domain.StatusOnline
				} else {
					m.Status = domain.StatusOffline
				}
			}
			members = append(members, m)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(members)
}

// AddRoomMembers adds new users to a group
func (h *ChatHandler) AddRoomMembers(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	roomIDStr := chi.URLParam(r, "id")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	var body struct {
		UserIDs []uuid.UUID `json:"user_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.UserIDs) == 0 {
		http.Error(w, `{"error":"user_ids array required"}`, http.StatusBadRequest)
		return
	}

	// Verify requester is a member of the room
	var userRole string
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2",
		roomID, claims.UserID,
	).Scan(&userRole)
	if err != nil {
		http.Error(w, `{"error":"forbidden: not a member"}`, http.StatusForbidden)
		return
	}

	for _, uID := range body.UserIDs {
		_, _ = h.db.Pool.Exec(r.Context(),
			"INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING",
			roomID, uID,
		)
		h.hub.SendToUser(uID, "room_joined", map[string]interface{}{"room_id": roomID})
	}

	_, _ = h.db.Pool.Exec(r.Context(), "UPDATE rooms SET updated_at = NOW() WHERE id = $1", roomID)

	h.hub.BroadcastEvent("room_members_updated", map[string]interface{}{
		"room_id": roomID,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "members_added"})
}

// RemoveRoomMember removes a member or allows self to leave group
func (h *ChatHandler) RemoveRoomMember(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	roomIDStr := chi.URLParam(r, "id")
	targetUserIDStr := chi.URLParam(r, "userId")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}
	targetUserID, err := uuid.Parse(targetUserIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid user id"}`, http.StatusBadRequest)
		return
	}

	var requesterRole string
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2",
		roomID, claims.UserID,
	).Scan(&requesterRole)
	if err != nil {
		http.Error(w, `{"error":"forbidden: not a member"}`, http.StatusForbidden)
		return
	}

	isSelf := (claims.UserID == targetUserID)
	if !isSelf && requesterRole != "owner" && requesterRole != "admin" {
		http.Error(w, `{"error":"forbidden: only owners or admins can remove members"}`, http.StatusForbidden)
		return
	}

	// If owner leaves, transfer ownership if another member exists
	if isSelf && requesterRole == "owner" {
		var nextOwnerID uuid.UUID
		err := h.db.Pool.QueryRow(r.Context(),
			"SELECT user_id FROM room_members WHERE room_id = $1 AND user_id != $2 ORDER BY joined_at ASC LIMIT 1",
			roomID, claims.UserID,
		).Scan(&nextOwnerID)
		if err == nil {
			_, _ = h.db.Pool.Exec(r.Context(),
				"UPDATE room_members SET role = 'owner' WHERE room_id = $1 AND user_id = $2",
				roomID, nextOwnerID,
			)
		} else {
			// No other members, delete the room
			_, _ = h.db.Pool.Exec(r.Context(), "DELETE FROM rooms WHERE id = $1", roomID)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"status": "room_deleted"})
			return
		}
	}

	_, _ = h.db.Pool.Exec(r.Context(),
		"DELETE FROM room_members WHERE room_id = $1 AND user_id = $2",
		roomID, targetUserID,
	)
	_, _ = h.db.Pool.Exec(r.Context(), "UPDATE rooms SET updated_at = NOW() WHERE id = $1", roomID)

	h.hub.BroadcastEvent("room_members_updated", map[string]interface{}{
		"room_id": roomID,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "member_removed"})
}

// UpdateRoom updates room name or settings
func (h *ChatHandler) UpdateRoom(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	roomIDStr := chi.URLParam(r, "id")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	var role string
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2",
		roomID, claims.UserID,
	).Scan(&role)
	if err != nil || (role != "owner" && role != "admin") {
		http.Error(w, `{"error":"forbidden: only owners or admins can update group"}`, http.StatusForbidden)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(),
		"UPDATE rooms SET name = $1, updated_at = NOW() WHERE id = $2",
		body.Name, roomID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to update room"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastEvent("room_updated", map[string]interface{}{
		"room_id": roomID,
		"name":    body.Name,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "updated", "name": body.Name})
}

// DeleteRoom disbands and removes a room (owner only)
func (h *ChatHandler) DeleteRoom(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	roomIDStr := chi.URLParam(r, "id")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	var role string
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2",
		roomID, claims.UserID,
	).Scan(&role)
	if err != nil || role != "owner" {
		http.Error(w, `{"error":"forbidden: only owner can delete room"}`, http.StatusForbidden)
		return
	}

	_, err = h.db.Pool.Exec(r.Context(), "DELETE FROM rooms WHERE id = $1", roomID)
	if err != nil {
		http.Error(w, `{"error":"failed to delete room"}`, http.StatusInternalServerError)
		return
	}

	h.hub.BroadcastEvent("room_deleted", map[string]interface{}{
		"room_id": roomID,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// GetMessages returns chat history with cursor pagination
func (h *ChatHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "id")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	// Verify requester is a member of the room
	var isMember bool
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT EXISTS(SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)",
		roomID, claims.UserID,
	).Scan(&isMember)
	if err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: not a room member"}`, http.StatusForbidden)
		return
	}

	query := `
		SELECT 
			m.id, 
			m.room_id, 
			m.sender_id, 
			COALESCE(u.username, 'Unknown'), 
			COALESCE(m.original_text, ''), 
			COALESCE(m.original_lang, 'en'), 
			COALESCE(m.translations, '{}'::jsonb), 
			m.media, 
			COALESCE(m.status, 'sent'), 
			m.created_at
		FROM messages m
		LEFT JOIN users u ON u.id = m.sender_id
		WHERE m.room_id = $1
		ORDER BY m.created_at DESC LIMIT 50`

	rows, err := h.db.Pool.Query(r.Context(), query, roomID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch messages"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	messages := make([]domain.Message, 0)
	for rows.Next() {
		var msg domain.Message
		var sName string
		if err := rows.Scan(&msg.ID, &msg.RoomID, &msg.SenderID, &sName, &msg.OriginalText, &msg.OriginalLanguage, &msg.Translations, &msg.Media, &msg.Status, &msg.CreatedAt); err != nil {
			log.Printf("⚠️ Error scanning chat message row: %v", err)
			continue
		}
		msg.SenderName = sName
		messages = append(messages, msg)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

// SendMessage saves and broadcasts a chat message
func (h *ChatHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	roomIDStr := chi.URLParam(r, "id")
	roomID, err := uuid.Parse(roomIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid room id"}`, http.StatusBadRequest)
		return
	}

	// Verify sender is an active member of this room
	var isMember bool
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT EXISTS(SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)",
		roomID, claims.UserID,
	).Scan(&isMember)
	if err != nil || !isMember {
		http.Error(w, `{"error":"forbidden: not a room member"}`, http.StatusForbidden)
		return
	}

	var body struct {
		Text             string          `json:"text"`
		OriginalLanguage string          `json:"original_language"`
		Translations     json.RawMessage `json:"translations"`
		Media            json.RawMessage `json:"media"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || (body.Text == "" && len(body.Media) == 0) {
		http.Error(w, `{"error":"message content cannot be empty"}`, http.StatusBadRequest)
		return
	}

	if body.OriginalLanguage == "" {
		body.OriginalLanguage = "en"
	}

	// Detect if text is written in Devanagari (Hindi) or other scripts
	for _, rChar := range body.Text {
		if rChar >= 0x0900 && rChar <= 0x097F {
			body.OriginalLanguage = "hi"
			break
		}
	}

	translationsMap := make(map[string]string)
	if len(body.Translations) > 0 {
		_ = json.Unmarshal(body.Translations, &translationsMap)
	}

	// Collect needed target languages from other room members
	var neededTargetLangs []string
	if body.Text != "" {
		langRows, err := h.db.Pool.Query(r.Context(),
			`SELECT DISTINCT u.preferred_language 
			 FROM room_members rm 
			 JOIN users u ON u.id = rm.user_id 
			 WHERE rm.room_id = $1 AND rm.user_id != $2 AND u.preferred_language IS NOT NULL AND u.preferred_language != '' AND LOWER(u.preferred_language) != LOWER($3)`,
			roomID, claims.UserID, body.OriginalLanguage,
		)
		if err == nil {
			defer langRows.Close()
			for langRows.Next() {
				var tLang string
				if err := langRows.Scan(&tLang); err == nil && tLang != "" {
					// Check Level 1/2 Cache first (< 2ms)
					if h.providerMgr != nil && h.providerMgr.GetCache() != nil {
						if cached, hit := h.providerMgr.GetCache().Get(r.Context(), body.OriginalLanguage, tLang, body.Text); hit {
							translationsMap[tLang] = cached
							continue
						}
					}
					neededTargetLangs = append(neededTargetLangs, tLang)
				}
			}
		}

		// If no other members had a different language (e.g. both profiles are "en" or "hi"),
		// ensure translation between English and Hindi is available so users can toggle translations anytime!
		if len(neededTargetLangs) == 0 && len(translationsMap) == 0 {
			fallbackLang := "hi"
			if strings.EqualFold(body.OriginalLanguage, "hi") {
				fallbackLang = "en"
			}
			neededTargetLangs = append(neededTargetLangs, fallbackLang)
		}
	}

	transBytes, _ := json.Marshal(translationsMap)
	body.Translations = transBytes

	var mediaParam interface{} = nil
	if len(body.Media) > 0 && string(body.Media) != "null" {
		mediaParam = body.Media
	}

	var msgID uuid.UUID
	var createdAt time.Time

	// 1. Instant zero-latency database insert (< 5ms)
	err = h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO messages (room_id, sender_id, original_text, original_lang, translations, media, status)
		 VALUES ($1, $2, $3, $4, $5, $6, 'sent')
		 RETURNING id, created_at`,
		roomID, claims.UserID, body.Text, body.OriginalLanguage, body.Translations, mediaParam,
	).Scan(&msgID, &createdAt)

	if err != nil {
		http.Error(w, `{"error":"failed to save message"}`, http.StatusInternalServerError)
		return
	}

	// 2. Enqueue uncached translations to asynchronous worker pool (non-blocking)
	if len(neededTargetLangs) > 0 && h.transQueue != nil {
		h.transQueue.Enqueue(translation.TranslationJob{
			MessageID:        msgID,
			RoomID:           roomID,
			SenderID:         claims.UserID,
			OriginalText:     body.Text,
			OriginalLanguage: body.OriginalLanguage,
			TargetLanguages:  neededTargetLangs,
		})
	}

	// Update room updated_at
	_, _ = h.db.Pool.Exec(r.Context(), "UPDATE rooms SET updated_at = NOW() WHERE id = $1", roomID)

	msg := domain.Message{
		ID:               msgID,
		RoomID:           roomID,
		SenderID:         &claims.UserID,
		SenderName:       claims.Username,
		OriginalText:     body.Text,
		OriginalLanguage: body.OriginalLanguage,
		Translations:     body.Translations,
		Media:            body.Media,
		Status:           "sent",
		CreatedAt:        createdAt,
	}

	// Broadcast via WebSocket hub to all members in room using background context (not cancelled by HTTP return)
	go func(rmID uuid.UUID, senderID uuid.UUID, m domain.Message) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		rows, err := h.db.Pool.Query(ctx, "SELECT user_id FROM room_members WHERE room_id = $1", rmID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var uID uuid.UUID
				if err := rows.Scan(&uID); err == nil && uID != senderID {
					h.hub.SendToUser(uID, "chat_message", m)
				}
			}
		}
	}(roomID, claims.UserID, msg)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}

// TranslateMessage performs on-demand translation of an existing chat message
func (h *ChatHandler) TranslateMessage(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	msgIDStr := chi.URLParam(r, "id")
	msgID, err := uuid.Parse(msgIDStr)
	if err != nil {
		http.Error(w, `{"error":"invalid message id"}`, http.StatusBadRequest)
		return
	}

	var body struct {
		TargetLanguage string `json:"target_language"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	targetLang := strings.TrimSpace(body.TargetLanguage)
	if targetLang == "" {
		targetLang = claims.PreferredLanguage
	}
	if targetLang == "" {
		targetLang = "en"
	}

	var originalText, originalLang string
	var rawTrans []byte
	err = h.db.Pool.QueryRow(r.Context(),
		"SELECT original_text, original_lang, COALESCE(translations, '{}'::jsonb) FROM messages WHERE id = $1",
		msgID,
	).Scan(&originalText, &originalLang, &rawTrans)

	if err != nil {
		http.Error(w, `{"error":"message not found"}`, http.StatusNotFound)
		return
	}

	transMap := make(map[string]string)
	_ = json.Unmarshal(rawTrans, &transMap)

	if existing, ok := transMap[targetLang]; ok && existing != "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":         true,
			"message_id":      msgID,
			"target_language": targetLang,
			"translated_text": existing,
		})
		return
	}

	if h.providerMgr == nil {
		http.Error(w, `{"error":"provider not available"}`, http.StatusServiceUnavailable)
		return
	}

	resList, err := h.providerMgr.TranslateBatch(r.Context(), []string{originalText}, originalLang, targetLang)
	if err != nil || len(resList) == 0 {
		http.Error(w, `{"error":"translation failed"}`, http.StatusInternalServerError)
		return
	}

	translated := resList[0]
	transMap[targetLang] = translated
	updatedBytes, _ := json.Marshal(transMap)

	_, _ = h.db.Pool.Exec(r.Context(), "UPDATE messages SET translations = $1 WHERE id = $2", updatedBytes, msgID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":         true,
		"message_id":      msgID,
		"target_language": targetLang,
		"translated_text": translated,
	})
}
