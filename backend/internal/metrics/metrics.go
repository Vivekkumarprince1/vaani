package metrics

import (
	"bufio"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics contains the application metrics exposed to Prometheus.
type Metrics struct {
	Registry             *prometheus.Registry
	HTTPRequestsTotal    *prometheus.CounterVec
	HTTPRequestDuration  *prometheus.HistogramVec
	WebSocketConnections prometheus.Gauge
	OnlineUsers          prometheus.Gauge
}

func New(version string) *Metrics {
	m := &Metrics{
		Registry: prometheus.NewRegistry(),
		HTTPRequestsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: "vaani", Name: "http_requests_total",
			Help: "Total number of HTTP requests handled by the backend.",
		}, []string{"method", "route", "status"}),
		HTTPRequestDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "vaani", Name: "http_request_duration_seconds",
			Help: "HTTP request duration in seconds.", Buckets: prometheus.DefBuckets,
		}, []string{"method", "route"}),
		WebSocketConnections: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "vaani", Name: "websocket_connections",
			Help: "Current number of live WebSocket connections.",
		}),
		OnlineUsers: prometheus.NewGauge(prometheus.GaugeOpts{
			Namespace: "vaani", Name: "online_users",
			Help: "Current number of unique users with a live WebSocket connection.",
		}),
	}
	m.Registry.MustRegister(m.HTTPRequestsTotal, m.HTTPRequestDuration, m.WebSocketConnections, m.OnlineUsers)
	info := prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "vaani", Name: "build_info", Help: "Backend build information.",
	}, []string{"version"})
	info.WithLabelValues(version).Set(1)
	m.Registry.MustRegister(info)
	return m
}

func (m *Metrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		route := chi.RouteContext(r.Context()).RoutePattern()
		if route == "" {
			route = "unknown"
		}
		m.HTTPRequestsTotal.WithLabelValues(r.Method, route, strconv.Itoa(recorder.status)).Inc()
		m.HTTPRequestDuration.WithLabelValues(r.Method, route).Observe(time.Since(started).Seconds())
	})
}

// Handler returns a Prometheus endpoint. When token is configured, only a
// matching Authorization: Bearer header can scrape it.
func (m *Metrics) Handler(token string) http.Handler {
	handler := promhttp.HandlerFor(m.Registry, promhttp.HandlerOpts{EnableOpenMetrics: true})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if token != "" {
			got := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
			if got != token {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
		}
		handler.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(body []byte) (int, error) {
	return r.ResponseWriter.Write(body)
}

// Hijack preserves WebSocket upgrades through the metrics middleware.
func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}
	return h.Hijack()
}

func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (r *statusRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}
