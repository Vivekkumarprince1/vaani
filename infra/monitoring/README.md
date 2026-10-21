# Vaani monitoring stack

This stack runs on the OCI VM alongside the systemd backend. It keeps
Prometheus and Grafana bound to `127.0.0.1`; expose Grafana only through a
VPN, SSH tunnel, or Cloudflare Access. Do not open ports 3000 or 9090 in the
OCI security list.

## First-time OCI setup

```bash
sudo mkdir -p /opt/vaani/monitoring/secrets
sudo cp infra/monitoring/docker-compose.yml /opt/vaani/monitoring/
sudo cp -r infra/monitoring/prometheus infra/monitoring/grafana /opt/vaani/monitoring/
sudo cp infra/monitoring/monitoring.env.example /etc/vaani/monitoring.env
sudoedit /etc/vaani/monitoring.env
sudoedit /etc/vaani/backend.env
```

Generate one token and use the same value in backend `METRICS_TOKEN` and the
Prometheus bearer-token file. The token is not a GitHub or Vercel variable.

```bash
openssl rand -hex 32
sudoedit /opt/vaani/monitoring/secrets/backend_metrics_token
sudo chmod 600 /opt/vaani/monitoring/secrets/backend_metrics_token
sudo systemctl restart vaani-backend
```

Copy the monitoring images/configuration into `/opt/vaani/monitoring`, then
start the stack:

```bash
cd /opt/vaani/monitoring
sudo docker compose --env-file /etc/vaani/monitoring.env up -d
sudo docker compose --env-file /etc/vaani/monitoring.env ps
```

The PostgreSQL exporter user should have monitoring-only permissions. Use
private OCI database and Redis endpoints in `monitoring.env`; never use public
endpoints or an application superuser.

## Access and verification

Create an SSH tunnel from a trusted workstation:

```bash
ssh -i ~/.ssh/vaani-api.key -L 3000:127.0.0.1:3000 ubuntu@92.4.68.46
```

Open `http://localhost:3000` and sign in with the Grafana credentials from
`/etc/vaani/monitoring.env`. Prometheus is available at
`http://localhost:9090` through a second tunnel if required.

Useful checks on OCI:

```bash
sudo docker compose --env-file /etc/vaani/monitoring.env ps
sudo docker compose --env-file /etc/vaani/monitoring.env logs --tail=100 prometheus
sudo docker compose --env-file /etc/vaani/monitoring.env logs --tail=100 grafana
curl -fsS -H "Authorization: Bearer $(sudo cat /opt/vaani/monitoring/secrets/backend_metrics_token)" http://127.0.0.1:8080/metrics | head
```

The provisioned `Vaani Overview` dashboard shows request rate, 5xx rate,
online users, and WebSocket connections. Prometheus alert rules cover backend
availability, HTTP 5xx errors, WebSocket drops, and disk usage. Configure a
real Alertmanager receiver before relying on alerts for incidents.
