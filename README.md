# 🎙️ Vaani v2 — High-Performance Multilingual Communication Platform

**Vaani v2** is a completely rewritten, modern real-time communication platform engineered with **Go (Golang)**, **Svelte 5 (Runes)**, **LiveKit SFU**, **PostgreSQL 16**, and **Redis**.

It solves language barriers during audio/video calls and chat by providing instant, low-latency live speech-to-speech audio and subtitle translation.

---

## ⚡ Tech Stack

* **Backend**: Go 1.27 (Chi Router, Pgxpool, Go-Redis, Gorilla WebSocket, LiveKit Server SDK Go v2)
* **Frontend**: Svelte 5 (SvelteKit, Runes `$state/$derived`, Tailwind CSS v4, Lucide Svelte, LiveKit Client)
* **Database**: PostgreSQL 16 (JSONB Dynamic Configuration & Relational Storage)
* **Caching & PubSub**: Redis 7+ (Zero-downtime hot-reload & presence)
* **Media & Calling**: LiveKit SFU (Unified 1:1 and Multi-party conferencing)
* **Audio Engine**: 16kHz PCM AudioWorklet (`static/worklets/pcm-processor.js`)

---

## 🎛️ The "Admin-First" Dynamic Engine

Vaani v2 moves all provider and audio tuning configurations from static environment files into an **encrypted, hot-reloading Admin Control Room**:

* **AI Provider Hot-Swapping**: Switch active STT (Groq Whisper, Azure Speech, Deepgram, OpenAI), Translation LLM (Groq Llama 3.3, Azure, OpenAI), and TTS (ElevenLabs, Azure, OpenAI) live without server restart.
* **Audio DSP Tuning**: Live sliders for VAD Energy Threshold, silence pause duration, audio ducking ratio, and sample rate.
* **Feature Toggles**: One-click toggles for direct calls, group calls, live subtitles, audio translation, and registration.
* **Room Kill Switch**: Real-time room inspector and instant termination.

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure PostgreSQL and Redis are running locally:
```bash
# Verify PostgreSQL and Redis
psql -d vaani_v2 -c "SELECT current_database();"
redis-cli ping
```

### 2. Run Backend
```bash
cd vaani-v2/backend
go run ./cmd/server
```
*Backend runs on `http://localhost:8080`*

### 3. Run Frontend
```bash
cd vaani-v2/frontend
npm run dev
```
*Frontend runs on `http://localhost:5173`*

---

## 🔑 Superadmin Bootstrap

The server auto-bootstraps the superadmin account upon initial boot using
`SUPERADMIN_EMAIL`, `SUPERADMIN_USERNAME`, and `SUPERADMIN_PASSWORD` from the
environment. There is no hard-coded default password.

## Repository migration status

The `v2` branch is the active production-hardening baseline. The former
JavaScript `client/` and `server/` applications were intentionally replaced
by the Go `backend/` and Svelte `frontend/` applications. The old directories
should not be restored during future fixes; use the v2 implementation and
migration schema as the source of truth.

## OCI production deployment

The repository includes production Dockerfiles for separate backend and
frontend containers. The recommended OCI layout is OCI Container Instances
with images stored in OCIR, OCI Database with PostgreSQL, OCI Cache with Redis,
and LiveKit Cloud. Follow the deployment runbook in `infra/oci/README.md`.

The backend migration image is `/app/migrate`; run it once against the target
database before starting or updating the backend. Locally, use `make migrate`.
Never commit real `.env` files or production credentials.
