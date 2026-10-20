// Command migrate applies the SQL files in backend/migrations exactly once.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "./migrations"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("create database pool: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("connect to database: %v", err)
	}

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		log.Fatalf("read migrations directory %q: %v", migrationsDir, err)
	}

	files := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			files = append(files, entry.Name())
		}
	}
	sort.Strings(files)
	if len(files) == 0 {
		log.Fatalf("no SQL migrations found in %q", migrationsDir)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		log.Fatalf("begin migration transaction: %v", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('vaani:schema_migrations'))`); err != nil {
		log.Fatalf("lock migrations: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`); err != nil {
		log.Fatalf("create schema_migrations table: %v", err)
	}

	for _, name := range files {
		var applied bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, name).Scan(&applied); err != nil {
			log.Fatalf("check migration %s: %v", name, err)
		}
		if applied {
			log.Printf("migration already applied: %s", name)
			continue
		}

		sql, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			log.Fatalf("read migration %s: %v", name, err)
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			log.Fatalf("apply migration %s: %v", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, name); err != nil {
			log.Fatalf("record migration %s: %v", name, err)
		}
		log.Printf("applied migration: %s", name)
	}

	if err := tx.Commit(ctx); err != nil {
		log.Fatalf("commit migrations: %v", err)
	}
	fmt.Printf("migrations complete: %d file(s) checked\n", len(files))
}
