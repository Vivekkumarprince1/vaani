package config

import "testing"

func TestEnvConfigValidateRequiresSecrets(t *testing.T) {
	env := EnvConfig{}
	if err := env.Validate(); err == nil {
		t.Fatal("expected missing JWT_SECRET to fail validation")
	}
}

func TestEnvConfigValidateAcceptsDevelopmentSecrets(t *testing.T) {
	env := EnvConfig{
		Env:                 "development",
		JWTSecret:           "12345678901234567890123456789012",
		ConfigEncryptionKey: "12345678901234567890123456789012",
		SuperadminPassword:  "a-strong-admin-password",
	}
	if err := env.Validate(); err != nil {
		t.Fatalf("expected valid development configuration, got %v", err)
	}
}

func TestEnvConfigValidateRequiresLiveKitInProduction(t *testing.T) {
	env := EnvConfig{
		Env:                 "production",
		DatabaseURL:         "postgres://user:password@db.example.com:5432/vaani?sslmode=require",
		RedisURL:            "redis://127.0.0.1:6379",
		AllowedOrigins:      "https://app.example.com",
		JWTSecret:           "12345678901234567890123456789012",
		ConfigEncryptionKey: "12345678901234567890123456789012",
		SuperadminPassword:  "a-strong-admin-password",
	}
	if err := env.Validate(); err == nil {
		t.Fatal("expected production LiveKit configuration to be required")
	}
}

func TestEnvConfigValidateRejectsLocalProductionOriginsAndDependencies(t *testing.T) {
	env := EnvConfig{
		Env:                 "production",
		DatabaseURL:         "postgres://user:password@db.example.com:5432/vaani?sslmode=require",
		RedisURL:            "redis://redis.example.com:6379",
		AllowedOrigins:      "http://localhost:5173",
		JWTSecret:           "12345678901234567890123456789012",
		ConfigEncryptionKey: "12345678901234567890123456789012",
		SuperadminPassword:  "a-strong-admin-password",
		LiveKitURL:          "wss://project.livekit.cloud",
		LiveKitAPIKey:       "key",
		LiveKitAPISecret:    "secret",
	}
	if err := env.Validate(); err == nil {
		t.Fatal("expected localhost production origin to fail validation")
	}
}
