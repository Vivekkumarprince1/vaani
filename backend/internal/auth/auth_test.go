package auth

import (
	"testing"

	"github.com/google/uuid"
)

func TestAuthenticatorRoundTrip(t *testing.T) {
	a := NewAuthenticator("12345678901234567890123456789012")
	id := uuid.New()
	token, err := a.GenerateToken(id, "alice", "user", "hi")
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	claims, err := a.ValidateToken(token)
	if err != nil {
		t.Fatalf("validate token: %v", err)
	}
	if claims.UserID != id || claims.Username != "alice" || claims.PreferredLanguage != "hi" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestAuthenticatorRejectsWrongSecret(t *testing.T) {
	a := NewAuthenticator("12345678901234567890123456789012")
	token, err := a.GenerateToken(uuid.New(), "alice", "user", "en")
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	if _, err := NewAuthenticator("different-secret-123456789012345").ValidateToken(token); err == nil {
		t.Fatal("expected token signed with another secret to be rejected")
	}
}
