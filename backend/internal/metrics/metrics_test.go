package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestHandlerRequiresBearerToken(t *testing.T) {
	m := New("test")
	h := m.Handler("secret-token")

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden without token, got %d", res.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/metrics", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	res = httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "vaani_build_info") {
		t.Fatalf("expected metrics response, got status %d body %q", res.Code, res.Body.String())
	}
}

func TestMiddlewareRecordsRouteAndStatus(t *testing.T) {
	m := New("test")
	r := chi.NewRouter()
	r.Use(m.Middleware)
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	res := httptest.NewRecorder()
	r.ServeHTTP(res, req)

	metrics := httptest.NewRecorder()
	m.Handler("").ServeHTTP(metrics, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := metrics.Body.String()
	if !strings.Contains(body, `route="/health"`) || !strings.Contains(body, `status="204"`) {
		t.Fatalf("expected route/status labels in metrics, got %q", body)
	}
}
