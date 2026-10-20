FROM golang:1.27-bookworm AS build

WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/server ./cmd/server \
    && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o /out/migrate ./cmd/migrate

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /out/server /app/server
COPY --from=build /out/migrate /app/migrate
COPY backend/migrations /app/migrations

ENV PORT=8080 \
    ENV=production \
    MIGRATIONS_DIR=/app/migrations
EXPOSE 8080

USER nobody
ENTRYPOINT ["/app/server"]
