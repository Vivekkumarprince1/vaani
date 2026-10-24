package handlers

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"vaani-v2/backend/internal/auth"
	"vaani-v2/backend/internal/database"
	"vaani-v2/backend/internal/domain"

	"github.com/google/uuid"
)

type AuthHandler struct {
	db            *database.DB
	authenticator *auth.Authenticator
	onLangUpdate  func(userID uuid.UUID, username, language string)
}

func NewAuthHandler(db *database.DB, authenticator *auth.Authenticator) *AuthHandler {
	return &AuthHandler{db: db, authenticator: authenticator}
}

func (h *AuthHandler) SetLanguageUpdateCallback(fn func(userID uuid.UUID, username, language string)) {
	h.onLangUpdate = fn
}

type RegisterRequest struct {
	Username          string `json:"username"`
	Email             string `json:"email"`
	Phone             string `json:"phone"`
	Password          string `json:"password"`
	PreferredLanguage string `json:"preferred_language"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	if len(req.Username) < 3 || len(req.Password) < 6 || !strings.Contains(req.Email, "@") {
		http.Error(w, `{"error":"validation failed: username >= 3 chars, password >= 6 chars, valid email"}`, http.StatusBadRequest)
		return
	}

	if len(req.Password) > 72 {
		req.Password = req.Password[:72]
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error":"failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	if req.PreferredLanguage == "" {
		req.PreferredLanguage = "en"
	}

	var userID uuid.UUID
	err = h.db.Pool.QueryRow(r.Context(),
		`INSERT INTO users (username, email, phone, password_hash, preferred_language, is_email_verified)
		 VALUES ($1, $2, NULLIF($3, ''), $4, $5, TRUE)
		 RETURNING id`,
		req.Username, req.Email, req.Phone, hash, req.PreferredLanguage,
	).Scan(&userID)

	if err != nil {
		errStr := strings.ToLower(err.Error())
		if strings.Contains(errStr, "unique") || strings.Contains(errStr, "duplicate key") || strings.Contains(errStr, "23505") {
			http.Error(w, `{"error":"username or email already registered"}`, http.StatusConflict)
			return
		}
		http.Error(w, `{"error":"failed to create user"}`, http.StatusInternalServerError)
		return
	}

	token, _ := h.authenticator.GenerateToken(userID, req.Username, domain.RoleUser, req.PreferredLanguage)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":                 userID,
			"username":           req.Username,
			"email":              req.Email,
			"role":               domain.RoleUser,
			"preferred_language": req.PreferredLanguage,
		},
	})
}

type LoginRequest struct {
	Identifier string `json:"identifier"` // Email or Username
	Password   string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request payload"}`, http.StatusBadRequest)
		return
	}

	identifier := strings.TrimSpace(req.Identifier)
	var user domain.User

	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, username, email, password_hash, role, preferred_language, is_active, status
		 FROM users 
		 WHERE email = LOWER($1) OR username = $1`,
		identifier,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.Role, &user.PreferredLanguage, &user.IsActive, &user.Status)

	if err != nil || !auth.CheckPasswordHash(req.Password, user.PasswordHash) {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	if !user.IsActive {
		http.Error(w, `{"error":"account has been deactivated"}`, http.StatusForbidden)
		return
	}

	// Update last active
	_, _ = h.db.Pool.Exec(r.Context(), "UPDATE users SET last_active_at = NOW(), status = 'online' WHERE id = $1", user.ID)

	token, _ := h.authenticator.GenerateToken(user.ID, user.Username, user.Role, user.PreferredLanguage)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":                 user.ID,
			"username":           user.Username,
			"email":              user.Email,
			"role":               user.Role,
			"preferred_language": user.PreferredLanguage,
			"status":             "online",
		},
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var user domain.User
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT id, username, email, phone, role, preferred_language, avatar_url, status, is_active, created_at
		 FROM users WHERE id = $1`,
		claims.UserID,
	).Scan(&user.ID, &user.Username, &user.Email, &user.Phone, &user.Role, &user.PreferredLanguage, &user.AvatarURL, &user.Status, &user.IsActive, &user.CreatedAt)

	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

func (h *AuthHandler) UpdateLanguage(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var body struct {
		Language string `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Language) == "" {
		http.Error(w, `{"error":"invalid language code"}`, http.StatusBadRequest)
		return
	}

	lang := strings.ToLower(strings.TrimSpace(body.Language))
	if lang == "auto" || lang == "detect" {
		lang = "en"
	}

	_, err := h.db.Pool.Exec(r.Context(), "UPDATE users SET preferred_language = $1, updated_at = $2 WHERE id = $3", lang, time.Now(), claims.UserID)
	if err != nil {
		http.Error(w, `{"error":"failed to update language"}`, http.StatusInternalServerError)
		return
	}

	token, _ := h.authenticator.GenerateToken(claims.UserID, claims.Username, claims.Role, lang)

	if h.onLangUpdate != nil {
		h.onLangUpdate(claims.UserID, claims.Username, lang)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":             "updated",
		"preferred_language": lang,
		"token":              token,
	})
}

func (h *AuthHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	rows, err := h.db.Pool.Query(r.Context(),
		`SELECT id, username, email, role, preferred_language, status, last_active_at
		 FROM users WHERE id != $1 AND is_active = TRUE
		 ORDER BY last_active_at DESC LIMIT 100`,
		claims.UserID,
	)
	if err != nil {
		http.Error(w, `{"error":"failed to list users"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := make([]domain.User, 0)
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.PreferredLanguage, &u.Status, &u.LastActiveAt); err == nil {
			users = append(users, u)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
