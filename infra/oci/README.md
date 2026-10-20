# OCI deployment runbook

This project is deployed as two OCI Container Instances (backend and
frontend), with container images stored in OCI Container Registry (OCIR).
PostgreSQL and Redis stay managed and private inside the same VCN.

OCI services used:

- OCI Container Registry (OCIR): versioned backend/frontend images
- OCI Container Instances: Go API and SvelteKit Node server
- OCI Database with PostgreSQL: application database
- OCI Cache with Redis: cache, presence, and pub/sub
- OCI Load Balancer or API Gateway: HTTPS, custom domains, and WebSockets
- OCI Vault: secrets and encryption keys
- LiveKit Cloud: WebRTC/SFU infrastructure

OCI Container Instances support container environment variables and HTTP health
checks. Keep PostgreSQL and Redis in private subnets; expose only HTTPS through
the load balancer. Do not expose port 5432 or 6379 to the public internet.

## 1. Build and push images

Set these local variables after creating an OCIR repository:

```bash
export OCI_REGION=ap-mumbai-1
export TENANCY_NAMESPACE=<tenancy-namespace>
export OCIR_REGISTRY=${OCI_REGION}.ocir.io
export IMAGE_TAG=v2
```

Log in to OCIR with an OCI auth token, then build and push:

```bash
docker login ${OCIR_REGISTRY} -u '<tenancy-namespace>/<oci-username>'

docker build -f backend/Dockerfile -t ${OCIR_REGISTRY}/${TENANCY_NAMESPACE}/vaani-backend:${IMAGE_TAG} .
docker push ${OCIR_REGISTRY}/${TENANCY_NAMESPACE}/vaani-backend:${IMAGE_TAG}

docker build -f frontend/Dockerfile \
  --build-arg VITE_API_BASE=https://api.example.com/api \
  --build-arg VITE_WS_BASE=wss://api.example.com/ws \
  --build-arg VITE_LIVEKIT_URL=wss://your-project.livekit.cloud \
  -t ${OCIR_REGISTRY}/${TENANCY_NAMESPACE}/vaani-frontend:${IMAGE_TAG} .
docker push ${OCIR_REGISTRY}/${TENANCY_NAMESPACE}/vaani-frontend:${IMAGE_TAG}
```

Use immutable tags such as the Git commit SHA for real releases instead of
reusing `v2`.

## 2. Configure OCI networking

Create a VCN with:

1. A private subnet for OCI Database with PostgreSQL and OCI Cache.
2. A private or restricted subnet for Container Instances.
3. A public load balancer subnet for HTTPS traffic.
4. Security rules allowing load balancer → frontend `3000`, load balancer →
   backend `8080`, backend → PostgreSQL, and backend → Redis.
5. Internet egress through a NAT gateway for provider APIs and LiveKit Cloud.

Route `/api/*`, `/ws`, `/health`, and `/ready` to the backend. Route all other
paths to the frontend. Enable WebSocket upgrade on the `/ws` route.

## 3. Run database migrations

Run the migration container from a trusted OCI Compute host or CI runner that
can reach the private database:

```bash
docker run --rm \
  -e DATABASE_URL="$DATABASE_URL" \
  -e MIGRATIONS_DIR=/app/migrations \
  ${OCIR_REGISTRY}/${TENANCY_NAMESPACE}/vaani-backend:${IMAGE_TAG} \
  /app/migrate
```

The migration runner creates `schema_migrations`, applies each SQL file once
in filename order, and uses a PostgreSQL advisory lock to prevent concurrent
deployments from applying the same migration.

## 4. Container configuration

Backend container:

- Image: `vaani-backend:${IMAGE_TAG}`
- Port: `8080`
- HTTP health check: `/health`
- Readiness check: `/ready`
- Variables: all values in `backend/.env.example`

Frontend container:

- Image: `vaani-frontend:${IMAGE_TAG}`
- Port: `3000`
- HTTP health check: `/health`
- Build arguments: values in `frontend/.env.example`

Store secrets in OCI Vault or the protected deployment configuration. Never
put JWT secrets, encryption keys, provider API keys, or LiveKit secrets in Git.

## 5. Release checklist

```bash
go test ./...
cd frontend && npm ci && npm run check && npm run build
```

Then push images, run `/app/migrate`, deploy the new containers, and verify:

```bash
curl -fsS https://api.example.com/health
curl -fsS https://api.example.com/ready
curl -fsS https://app.example.com/health
```

References: [OCI Container Instances](https://docs.oracle.com/en-us/iaas/Content/container-instances/overview-of-container-instances.htm), [OCI Database with PostgreSQL](https://docs.oracle.com/en-us/iaas/Content/postgresql/overview.htm), [OCI Cache](https://docs.oracle.com/en-us/iaas/Content/ocicache/home.htm), and [OCIR image push](https://docs.oracle.com/en-us/iaas/Content/Registry/Tasks/registrypushingimagesusingthedockercli.htm).
