.PHONY: backend frontend dev install-all test migrate

backend:
	cd backend && go run ./cmd/server

frontend:
	cd frontend && npm run dev

migrate:
	cd backend && go run ./cmd/migrate

install-all:
	cd backend && go mod tidy
	cd frontend && npm install

build-backend:
	cd backend && go build -o bin/server ./cmd/server

build-frontend:
	cd frontend && npm run build

build: build-backend build-frontend
