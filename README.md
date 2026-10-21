# 🎙️ Vaani v2 — High-Performance Multilingual Communication Platform

For a complete agent/IDE handoff covering architecture, exact OCI paths,
deployment flow, environment ownership, monitoring, and troubleshooting, see
the [project handoff](docs/PROJECT-HANDOFF.md).

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

## Environment and secret management

Use `backend/.env.example` as the variable reference. Do not copy production
values into Git, `.env` files in the repository, GitHub logs, Vercel build
logs, or chat messages.

### Backend variable groups

Required at backend startup:

| Variable | Purpose |
| --- | --- |
| `ENV` | Runtime environment; use `production` on OCI. |
| `PORT` | HTTP port; production uses `8080`. |
| `DATABASE_URL` | PostgreSQL connection string. Keep the database private. |
| `REDIS_URL` | Redis connection string for cache, presence, and pub/sub. |
| `JWT_SECRET` | At least 32 random characters for API tokens. |
| `CONFIG_ENCRYPTION_KEY` | At least 32 random characters for encrypted provider configuration. |
| `SUPERADMIN_USERNAME` | Initial superadmin username. |
| `SUPERADMIN_EMAIL` | Initial superadmin email. |
| `SUPERADMIN_PASSWORD` | Strong initial superadmin password. |
| `ALLOWED_ORIGINS` | Comma-separated exact browser origins allowed by API/CORS. |
| `ALLOWED_ORIGIN_SUFFIXES` | Optional scoped Vercel preview suffixes, for example `-your-team.vercel.app`; only hosts beginning with `vaani-` match. |
| `LIVEKIT_URL` | LiveKit Cloud WebSocket URL. |
| `LIVEKIT_API_KEY` | LiveKit server API key. |
| `LIVEKIT_API_SECRET` | LiveKit server API secret. |

Optional integrations such as Cloudinary are listed in
`backend/.env.example`. Provider credentials are normally managed from the
encrypted Admin Control Room and are not placed in the frontend.

Generate strong values locally:

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # CONFIG_ENCRYPTION_KEY
```

### Production backend environment on OCI

The live backend reads its environment from `/etc/vaani/backend.env` through
the systemd unit `vaani-backend.service`. The file must stay on the OCI VM,
owned by root, and must not be copied through GitHub Actions.

```bash
ssh -i ~/.ssh/vaani-api.key ubuntu@92.4.68.46

# Edit securely; do not print the file
sudoedit /etc/vaani/backend.env

# Apply changes
sudo systemctl daemon-reload
sudo systemctl restart vaani-backend
sudo systemctl status vaani-backend --no-pager
```

Verify only variable names are present, without exposing values:

```bash
sudo grep -E '^(ENV|PORT|DATABASE_URL|REDIS_URL|JWT_SECRET|CONFIG_ENCRYPTION_KEY|SUPERADMIN_|ALLOWED_ORIGINS|ALLOWED_ORIGIN_SUFFIXES|LIVEKIT_)=' \
  /etc/vaani/backend.env | sed 's/=.*$/=<set>/'
```

After an environment change, verify the service and dependencies:

```bash
curl -fsS https://vaani-bc.fmpg.in/health
curl -fsS https://vaani-bc.fmpg.in/ready
sudo journalctl -u vaani-backend -n 100 --no-pager
```

`ALLOWED_ORIGINS` must contain the production frontend origin exactly:

```text
https://vaani-ten-phi.vercel.app
```

If Vercel preview deployments are needed, configure a narrowly scoped
`ALLOWED_ORIGIN_SUFFIXES` value. Never use a global `*.vercel.app` rule.

### Frontend environment on Vercel

Frontend `VITE_*` variables are public and are bundled into browser JavaScript;
they must never contain secrets. In the Vercel project `vaani`, configure:

```text
VITE_API_BASE=https://vaani-bc.fmpg.in/api
VITE_WS_BASE=wss://vaani-bc.fmpg.in/ws
VITE_LIVEKIT_URL=wss://vaani-eigmeqwu.livekit.cloud
```

Set them for the required Vercel environments (Production, Preview, and
Development), then create a new deployment. Backend secrets do not belong in
Vercel.

### GitHub Actions environment

The backend workflow uses the protected GitHub environment `vaani-v2` for
deployment approval/context. The current self-hosted OCI runner deploys
artifacts directly on the VM and does not transfer `/etc/vaani/backend.env`.
Changing an application secret therefore requires editing the OCI env file
and restarting the service; changing code requires pushing to `v2`.

### Rotation rules

- Rotate `JWT_SECRET` when tokens may be exposed; all existing login tokens
  will become invalid and users must log in again.
- Rotate provider and LiveKit keys at their provider, then update the OCI env
  or encrypted Admin Control Room configuration as appropriate.
- Change the superadmin password through the authenticated admin flow when
  available. `SUPERADMIN_PASSWORD` is the bootstrap input and is not a safe
  substitute for a password-management workflow for an existing account.
- After every rotation, restart the backend and run `/health`, `/ready`, login,
  and WebSocket smoke checks.

## Monitoring

The backend exposes a Prometheus-compatible `/metrics` endpoint. Set
`METRICS_TOKEN` in the OCI backend environment to require a bearer token.
The complete OCI stack—Prometheus, Grafana, Node Exporter, PostgreSQL Exporter,
Redis Exporter, alert rules, and a starter dashboard—is in
`infra/monitoring/`. Follow its [runbook](infra/monitoring/README.md); keep
Prometheus/Grafana bound to localhost or behind VPN/Cloudflare Access.

The existing Admin Control Room metrics are application UI data. Prometheus
is the historical time-series source for request latency/errors, WebSocket
connections, online users, VM resources, PostgreSQL, and Redis.

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
