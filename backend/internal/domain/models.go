package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// User Roles
const (
	RoleUser       = "user"
	RoleAdmin      = "admin"
	RoleSuperadmin = "superadmin"
)

// User Statuses
const (
	StatusOnline  = "online"
	StatusOffline = "offline"
	StatusInCall  = "in_call"
)

// User represents a user account
type User struct {
	ID                uuid.UUID  `json:"id" db:"id"`
	Username          string     `json:"username" db:"username"`
	Email             string     `json:"email" db:"email"`
	Phone             *string    `json:"phone,omitempty" db:"phone"`
	PasswordHash      string     `json:"-" db:"password_hash"`
	Role              string     `json:"role" db:"role"`
	PreferredLanguage string     `json:"preferred_language" db:"preferred_language"`
	AvatarURL         *string    `json:"avatar_url,omitempty" db:"avatar_url"`
	Status            string     `json:"status" db:"status"`
	IsActive          bool       `json:"is_active" db:"is_active"`
	IsEmailVerified   bool       `json:"is_email_verified" db:"is_email_verified"`
	EmailOTP          *string    `json:"-" db:"email_otp"`
	EmailOTPExpiresAt *time.Time `json:"-" db:"email_otp_expires_at"`
	LastActiveAt      time.Time  `json:"last_active_at" db:"last_active_at"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
}

// SystemSetting represents dynamic admin configuration
type SystemSetting struct {
	ID        uuid.UUID       `json:"id" db:"id"`
	Category  string          `json:"category" db:"category"` // providers, audio_dsp, feature_flags, languages
	ActiveKey string          `json:"active_key" db:"active_key"`
	Config    json.RawMessage `json:"config" db:"config"` // Encrypted or plain JSON config
	UpdatedBy *uuid.UUID      `json:"updated_by,omitempty" db:"updated_by"`
	UpdatedAt time.Time       `json:"updated_at" db:"updated_at"`
}

// Room represents 1-on-1 direct or group meeting space
type Room struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	RoomSlug  string    `json:"room_slug" db:"room_slug"` // LiveKit Room Identifier
	Type      string    `json:"type" db:"type"`           // direct, group
	CreatedBy *uuid.UUID `json:"created_by,omitempty" db:"created_by"`
	IsActive  bool      `json:"is_active" db:"is_active"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// RoomMember represents participant membership in a room
type RoomMember struct {
	RoomID   uuid.UUID `json:"room_id" db:"room_id"`
	UserID   uuid.UUID `json:"user_id" db:"user_id"`
	Role     string    `json:"role" db:"role"` // owner, admin, member
	JoinedAt time.Time `json:"joined_at" db:"joined_at"`
}

// UserSummary represents minimal user profile for room participants
type UserSummary struct {
	ID                uuid.UUID `json:"id"`
	Username          string    `json:"username"`
	Email             string    `json:"email"`
	PreferredLanguage string    `json:"preferred_language"`
	Status            string    `json:"status"`
	AvatarURL         *string   `json:"avatar_url,omitempty"`
}

// RoomDetail represents rich room metadata for frontend lists
type RoomDetail struct {
	ID          uuid.UUID    `json:"id"`
	Name        string       `json:"name"`
	RoomSlug    string       `json:"room_slug"`
	Type        string       `json:"type"` // direct, group
	Role        string       `json:"role"` // user's role in this room
	MemberCount int          `json:"member_count"`
	CreatedBy   *uuid.UUID   `json:"created_by,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
	LastMessage *string      `json:"last_message,omitempty"`
	OtherUser   *UserSummary `json:"other_user,omitempty"`
}

// RoomMemberDetail represents a member of a room with full profile
type RoomMemberDetail struct {
	RoomID            uuid.UUID `json:"room_id"`
	UserID            uuid.UUID `json:"user_id"`
	Username          string    `json:"username"`
	Email             string    `json:"email"`
	Role              string    `json:"role"`
	PreferredLanguage string    `json:"preferred_language"`
	Status            string    `json:"status"`
	AvatarURL         *string   `json:"avatar_url,omitempty"`
	JoinedAt          time.Time `json:"joined_at"`
}

// Message represents instant messages with real-time translation map
type Message struct {
	ID               uuid.UUID       `json:"id" db:"id"`
	RoomID           uuid.UUID       `json:"room_id" db:"room_id"`
	SenderID         *uuid.UUID      `json:"sender_id,omitempty" db:"sender_id"`
	SenderName       string          `json:"sender_name,omitempty" db:"-"`
	OriginalText     string          `json:"original_text" db:"original_text"`
	OriginalLanguage string          `json:"original_language" db:"original_language"`
	Translations     json.RawMessage `json:"translations" db:"translations"` // Map of lang code -> translated text
	Media            json.RawMessage `json:"media,omitempty" db:"media"`     // Cloudinary metadata
	Status           string          `json:"status" db:"status"`             // queued, sent, delivered, seen
	DeliveredAt      *time.Time      `json:"delivered_at,omitempty" db:"delivered_at"`
	SeenAt           *time.Time      `json:"seen_at,omitempty" db:"seen_at"`
	CreatedAt        time.Time       `json:"created_at" db:"created_at"`
}

// CallLog represents a completed or active audio/video call
type CallLog struct {
	ID              uuid.UUID       `json:"id" db:"id"`
	CallRoomID      string          `json:"call_room_id" db:"call_room_id"`
	RoomID          *uuid.UUID      `json:"room_id,omitempty" db:"room_id"`
	InitiatorID     *uuid.UUID      `json:"initiator_id,omitempty" db:"initiator_id"`
	CallType        string          `json:"call_type" db:"call_type"` // audio, video
	Status          string          `json:"status" db:"status"`       // ringing, active, ended, missed
	StartedAt       time.Time       `json:"started_at" db:"started_at"`
	EndedAt         *time.Time      `json:"ended_at,omitempty" db:"ended_at"`
	DurationSeconds int             `json:"duration_seconds" db:"duration_seconds"`
	Participants    json.RawMessage `json:"participants" db:"participants"`
	Metrics         json.RawMessage `json:"metrics" db:"metrics"`
}

// AuditLog tracks administrative actions
type AuditLog struct {
	ID        uuid.UUID       `json:"id" db:"id"`
	AdminID   *uuid.UUID      `json:"admin_id,omitempty" db:"admin_id"`
	Action    string          `json:"action" db:"action"`
	Details   json.RawMessage `json:"details" db:"details"`
	CreatedAt time.Time       `json:"created_at" db:"created_at"`
}
