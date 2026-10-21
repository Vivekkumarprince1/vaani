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

The frontend deploys to Vercel and the backend runs as a systemd service on
the OCI VM. PostgreSQL and Redis run in the OCI deployment environment, while
LiveKit uses LiveKit Cloud. Follow the deployment runbook in
`infra/oci/README.md`.

The backend migration image is `/app/migrate`; run it once against the target
database before starting or updating the backend. Locally, use `make migrate`.
Never commit real `.env` files or production credentials.

## Production operations and monitoring

The production backend runs on the OCI VM at `92.4.68.46` as the
`vaani-backend` systemd service. Connect with the OCI deployment key:

```bash
ssh -i ~/.ssh/vaani-api.key ubuntu@92.4.68.46
```

### Backend logs and service status

```bash
# Follow live backend logs
sudo journalctl -u vaani-backend -f

# Show recent logs
sudo journalctl -u vaani-backend -n 100 --no-pager

# Show today's logs
sudo journalctl -u vaani-backend --since today --no-pager

# Show likely failures only
sudo journalctl -u vaani-backend --since today --no-pager \
  | grep -iE "error|failed|panic|fatal"

# Service status and restart
sudo systemctl status vaani-backend
sudo systemctl restart vaani-backend
```

### Health and readiness checks

```bash
curl https://vaani-bc.fmpg.in/health
curl https://vaani-bc.fmpg.in/ready
```

`/health` confirms the process is responding. `/ready` also checks the
backend's required dependencies.

### Nginx and WebSocket monitoring

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

sudo journalctl -u vaani-backend -f \
  | grep -iE "WS|websocket|upgrade"
```

### Server, Redis, and database checks

```bash
# VM resources
free -h
df -h
uptime
top

# Redis
sudo systemctl status redis-server
redis-cli ping
```

For PostgreSQL, use the configured production `DATABASE_URL` without
printing it in logs or chat:

```bash
psql "$DATABASE_URL" -c "SELECT current_database(), now();"
```

### GitHub Actions CI/CD monitoring

From the repository checkout, list backend deployment runs:

```bash
gh run list \
  --repo Vivekkumarprince1/vaani \
  --workflow "Deploy backend to OCI" \
  --branch v2
```

Inspect a particular run or follow it live:

```bash
gh run view RUN_ID --repo Vivekkumarprince1/vaani --log
gh run watch RUN_ID --repo Vivekkumarprince1/vaani
```

A successful deployment must pass backend tests, build, artifact upload,
OCI installation, migration, service restart, and `/health` plus `/ready`
smoke checks.

### Vercel frontend logs

```bash
vercel logs https://vaani-ten-phi.vercel.app
```

You can also open Vercel Dashboard → Project → Deployments → deployment →
Runtime Logs.

Never paste JWTs, passwords, API keys, private keys, or complete database
URLs when sharing logs or troubleshooting output.
