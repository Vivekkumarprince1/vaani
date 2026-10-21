package ws

import (
	"net/http/httptest"
	"testing"
)

func TestHubAllowedOrigin(t *testing.T) {
	h := NewHub(nil, "https://app.example.com", "http://localhost:5173")

	allowed := httptest.NewRequest("GET", "/ws", nil)
	allowed.Header.Set("Origin", "https://app.example.com")
	if !h.isAllowedOrigin(allowed) {
		t.Fatal("configured origin should be allowed")
	}

	denied := httptest.NewRequest("GET", "/ws", nil)
	denied.Header.Set("Origin", "https://evil.example.com")
	if h.isAllowedOrigin(denied) {
		t.Fatal("unconfigured origin should be denied")
	}

	native := httptest.NewRequest("GET", "/ws", nil)
	if !h.isAllowedOrigin(native) {
		t.Fatal("non-browser clients without Origin should be allowed")
	}
}

func TestHubAllowedOriginSuffix(t *testing.T) {
	h := NewHubWithSuffixes(nil, []string{"-vivek-kumars-projects-129c22bf.vercel.app"}, "https://vaani-ten-phi.vercel.app")
	preview := httptest.NewRequest("GET", "/ws", nil)
	preview.Header.Set("Origin", "https://vaani-git-v2-vivek-kumars-projects-129c22bf.vercel.app")
	if !h.isAllowedOrigin(preview) {
		t.Fatal("expected project preview origin to be allowed")
	}
	other := httptest.NewRequest("GET", "/ws", nil)
	other.Header.Set("Origin", "https://other-git-v2-vivek-kumars-projects-129c22bf.vercel.app")
	if h.isAllowedOrigin(other) {
		t.Fatal("did not expect another Vercel project origin to be allowed")
	}
}
