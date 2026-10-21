# Vaani v2 project handoff

This is the operational source of truth for continuing Vaani v2 from another
agent, IDE, or workstation. Read this file and the referenced runbooks before
changing deployment code.

## 1. Current production topology

```text
Browser
  ├─ Vercel: SvelteKit frontend (project: vaani)
  └─ HTTPS/WSS → Cloudflare → Nginx → OCI VM
                                └─ systemd: vaani-backend (Go API)
                                   ├─ OCI PostgreSQL
                                   ├─ OCI Redis
                                   └─ LiveKit Cloud
```

Production endpoints:

| Component | Location |
| --- | --- |
| Frontend | `https://vaani-ten-phi.vercel.app` |
| Backend API | `https://vaani-bc.fmpg.in` |
| WebSocket | `wss://vaani-bc.fmpg.in/ws` |
| OCI VM | `ubuntu@92.4.68.46` |
| Git branch | `v2` |
| Repository | `Vivekkumarprince1/vaani` |

The old JavaScript `client/` and `server/` implementation is not the source
of truth. Use `backend/` and `frontend/` only.

## 2. Repository map

- `backend/cmd/server` — Go API entrypoint, routes, startup and dependencies.
- `backend/cmd/migrate` — idempotent PostgreSQL migration runner.
- `backend/internal/auth` — JWT authentication and role middleware.
- `backend/internal/config` — boot environment validation and encrypted dynamic config.
- `backend/internal/handlers` — HTTP API handlers.
- `backend/internal/ws` — authenticated WebSocket hub and live presence.
- `backend/internal/livekit` — LiveKit room/token integration.
- `backend/internal/providers` — provider state and encrypted provider configuration.
- `backend/internal/metrics` — Prometheus metrics endpoint and HTTP instrumentation.
- `backend/migrations` — ordered SQL migrations; never edit an applied migration.
- `frontend/src` — SvelteKit UI and browser API/WebSocket clients.
- `.github/workflows/ci.yml` — PR/push validation for backend and frontend.
- `.github/workflows/backend-deploy.yml` — backend build and OCI deployment.
- `infra/oci/README.md` — OCI deployment notes.
- `infra/monitoring/` — Prometheus, Grafana, exporters, alerts and runbook.
- `README.md` — user-facing setup, environment and operations reference.

## 3. Backend deployment flow

Pushes to `v2` that change `backend/**` trigger the backend workflow:

1. GitHub-hosted runner checks out the commit.
2. Go tests run with `go test ./...`.
3. Linux amd64 binaries are built: `server-release` and `migrate-release`.
4. The artifact is passed to the OCI self-hosted runner labeled
   `vaani-oci`.
5. The runner executes only `sudo /usr/local/sbin/vaani-deploy`.
6. That root-owned script installs the release under `/opt/vaani/server`,
   runs migrations, restarts `vaani-backend`, and smoke-tests health/readiness.

The current deployment does **not** use GitHub SSH/scp secrets. It uses the
self-hosted runner already installed on the OCI VM. Do not reintroduce the old
SSH upload workflow unless the deployment architecture is intentionally changed.

Production runtime paths on OCI:

```text
/opt/vaani/server              deployed backend binary and migrations
/etc/vaani/backend.env         production secrets and boot configuration
/usr/local/sbin/vaani-deploy   restricted root deployment command
vaani-backend.service          systemd service
```

Check deployment runs from any machine with GitHub CLI:

```bash
gh run list --repo Vivekkumarprince1/vaani \
  --workflow "Deploy backend to OCI" --branch v2
gh run view RUN_ID --repo Vivekkumarprince1/vaani --log
```

Before changing deployment behavior, inspect the workflow and confirm the
OCI runner labels. A cancelled workflow is not a failed application release;
inspect the exact failed/cancelled job first.

## 4. Production environment ownership

Backend secrets live only on OCI in `/etc/vaani/backend.env`. GitHub Actions
deploys binaries and migrations; it does not overwrite this file. Vercel only
contains public `VITE_*` frontend values.

Backend required values are documented in `backend/.env.example`. The important
production values are:

- PostgreSQL: `DATABASE_URL`
- Redis: `REDIS_URL`
- Auth/encryption: `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY`
- Bootstrap account: `SUPERADMIN_USERNAME`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`
- Browser security: `ALLOWED_ORIGINS`, optional scoped `ALLOWED_ORIGIN_SUFFIXES`
- LiveKit: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Monitoring: `METRICS_TOKEN`

Safe OCI environment update:

```bash
ssh -i ~/.ssh/vaani-api.key ubuntu@92.4.68.46
sudoedit /etc/vaani/backend.env
sudo systemctl restart vaani-backend
sudo systemctl status vaani-backend --no-pager
```

Never print or paste this file. To check only whether names are present:

```bash
sudo grep -E '^(ENV|PORT|DATABASE_URL|REDIS_URL|JWT_SECRET|CONFIG_ENCRYPTION_KEY|SUPERADMIN_|ALLOWED_ORIGINS|ALLOWED_ORIGIN_SUFFIXES|METRICS_TOKEN|LIVEKIT_)=' /etc/vaani/backend.env \
  | sed 's/=.*$/=<set>/'
```

After changing a secret, restart the service and test `/health`, `/ready`,
login, and WebSocket connectivity. Rotating `JWT_SECRET` invalidates existing
tokens. `SUPERADMIN_PASSWORD` is a bootstrap input; it is not a general
password reset mechanism for an already-created account.

## 5. Frontend deployment and runtime URLs

The correct Vercel project is `vaani`, not the unrelated `frontend` project.
Its public variables are:

```text
VITE_API_BASE=https://vaani-bc.fmpg.in/api
VITE_WS_BASE=wss://vaani-bc.fmpg.in/ws
VITE_LIVEKIT_URL=wss://vaani-eigmeqwu.livekit.cloud
```

`VITE_*` values are public browser configuration. Never put API keys, JWT
secrets, database URLs, or provider secrets in them. After changing Vercel
variables, create a new deployment; existing browser bundles do not change.

## 6. Monitoring

The backend `/metrics` endpoint exposes request totals, request duration,
HTTP 5xx status counts, online users, WebSocket connections, and build info.
The OCI monitoring stack is documented in `infra/monitoring/README.md` and
includes Prometheus, Grafana, Node Exporter, PostgreSQL Exporter, Redis
Exporter, and Alertmanager. Prometheus/Grafana must stay localhost-bound or
behind VPN/Cloudflare Access.

Useful backend checks:

```bash
curl -fsS https://vaani-bc.fmpg.in/health
curl -fsS https://vaani-bc.fmpg.in/ready
sudo journalctl -u vaani-backend -f
sudo tail -f /var/log/nginx/error.log
```

## 7. Safe development checklist

```bash
cd backend && go test ./...
cd ../frontend && npm ci && npm run check && npm run build
```

For a backend-only change, push to `v2` only after tests pass. Do not commit
`.env`, production credentials, private keys, JWTs, or generated build output.
Use a new migration file for schema changes; do not rewrite an already-applied
SQL migration. Keep WebSocket URLs as `wss://` whenever the frontend is HTTPS.

## 8. Common failure diagnosis

| Symptom | First checks |
| --- | --- |
| 502/Cloudflare 521 | `systemctl status vaani-backend`, Nginx error log, port 8080 listener |
| CORS failure | exact frontend origin in `ALLOWED_ORIGINS`; check browser preview origin |
| WebSocket failure | frontend uses `wss://`, Nginx upgrade config, backend origin allowlist |
| Login 401 | credentials/bootstrap state, database connectivity, backend logs |
| `/ready` fails | PostgreSQL reachability and `DATABASE_URL` |
| Deployment cancelled | inspect the failed job; verify self-hosted runner is online and idle |
| Monitoring scrape forbidden | `METRICS_TOKEN` matches the Prometheus bearer-token file |

When asking another agent for help, provide the commit SHA, workflow run ID,
endpoint status, and redacted log lines—not secrets or complete tokens.
