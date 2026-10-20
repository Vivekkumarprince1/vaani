-- ========================================================
-- 🚀 VAANI v2 INITIAL DATABASE SCHEMA
-- ========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================================
-- 1. USERS & RBAC
-- ========================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
    preferred_language VARCHAR(10) DEFAULT 'en',
    avatar_url TEXT,
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'in_call')),
    is_active BOOLEAN DEFAULT TRUE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    email_otp VARCHAR(10),
    email_otp_expires_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ========================================================
-- 2. DYNAMIC SYSTEM SETTINGS (ADMIN PANEL ENGINE)
-- ========================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) UNIQUE NOT NULL, 
    -- 'providers', 'audio_dsp', 'feature_flags', 'languages', 'limits'
    active_key VARCHAR(50) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb, 
    -- Encrypted API keys, models, temperatures, endpoints
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);

-- ========================================================
-- 3. UNIFIED ROOMS (1:1 DIRECT & MULTI-PARTY GROUPS)
-- ========================================================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100),
    room_slug VARCHAR(100) UNIQUE NOT NULL, -- LiveKit Room Name
    type VARCHAR(20) DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_slug ON rooms(room_slug);
CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(type);

CREATE TABLE IF NOT EXISTS room_members (
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);

-- ========================================================
-- 4. MESSAGES & MULTILINGUAL CHAT
-- ========================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    original_text TEXT,
    original_lang VARCHAR(10) DEFAULT 'en',
    translations JSONB DEFAULT '{}'::jsonb, 
    -- e.g. {"hi": "नमस्ते", "es": "Hola"}
    media JSONB, 
    -- {url, public_id, mime_type, filename, size, resource_type}
    status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'seen')),
    delivered_at TIMESTAMPTZ,
    seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC);

-- ========================================================
-- 5. CALL SESSIONS & LATENCY METRICS
-- ========================================================
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_room_id VARCHAR(100) NOT NULL,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    initiator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    call_type VARCHAR(10) DEFAULT 'video' CHECK (call_type IN ('audio', 'video')),
    status VARCHAR(20) DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'ended', 'missed')),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INT DEFAULT 0,
    participants JSONB DEFAULT '[]'::jsonb,
    metrics JSONB DEFAULT '{}'::jsonb 
    -- {avg_latency_ms, stt_ms, tts_ms, total_translation_turns}
);

CREATE INDEX IF NOT EXISTS idx_call_logs_room ON call_logs(call_room_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_initiator ON call_logs(initiator_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_started ON call_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_updated ON rooms(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active, last_active_at DESC);

-- ========================================================
-- 6. AUDIT LOGS (ADMIN ACTIONS TRACKING)
-- ========================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- 'UPDATE_PROVIDER', 'KILL_ROOM', 'BAN_USER'
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
