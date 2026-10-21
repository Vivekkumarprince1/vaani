package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"vaani-v2/backend/internal/auth"
	"vaani-v2/backend/internal/redis"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 16,
	WriteBufferSize: 1024 * 16,
	// ServeWS performs the explicit origin allowlist check before upgrading.
	// Gorilla's default CheckOrigin would reject every browser origin again.
	CheckOrigin: func(_ *http.Request) bool { return true },
}

// Event represents incoming and outgoing WebSocket frames
type Event struct {
	Type      string          `json:"type"` // e.g. "call_invite", "call_answer", "subtitle", "chat_message"
	Payload   json.RawMessage `json:"payload"`
	Timestamp int64           `json:"timestamp"`
}

type Client struct {
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	UserID   uuid.UUID
	Username string
	Language string
}

type Hub struct {
	mu                    sync.RWMutex
	clients               map[uuid.UUID]map[*Client]bool // UserID -> set of client connections (multi-device)
	broadcast             chan []byte
	register              chan *Client
	unregister            chan *Client
	redis                 *redis.Client
	allowedOrigins        map[string]struct{}
	allowedOriginSuffixes []string
}

func NewHub(rdb *redis.Client, origins ...string) *Hub {
	return NewHubWithSuffixes(rdb, nil, origins...)
}

func NewHubWithSuffixes(rdb *redis.Client, suffixes []string, origins ...string) *Hub {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		if origin != "" {
			allowed[origin] = struct{}{}
		}
	}
	return &Hub{
		clients:               make(map[uuid.UUID]map[*Client]bool),
		broadcast:             make(chan []byte, 256),
		register:              make(chan *Client),
		unregister:            make(chan *Client),
		redis:                 rdb,
		allowedOrigins:        allowed,
		allowedOriginSuffixes: suffixes,
	}
}

func (h *Hub) isAllowedOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// Non-browser clients do not send Origin. The endpoint still requires a
		// valid JWT, so allow those clients while validating browser origins.
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}
	_, ok := h.allowedOrigins[parsed.Scheme+"://"+parsed.Host]
	if ok {
		return true
	}
	for _, suffix := range h.allowedOriginSuffixes {
		if strings.HasSuffix(parsed.Host, suffix) && strings.HasPrefix(parsed.Host, "vaani-") {
			return true
		}
	}
	return false
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if _, ok := h.clients[client.UserID]; !ok {
				h.clients[client.UserID] = make(map[*Client]bool)
			}
			h.clients[client.UserID][client] = true
			h.mu.Unlock()

			// Broadcast online presence
			h.BroadcastPresence(client.UserID.String(), "online")

		case client := <-h.unregister:
			h.mu.Lock()
			if conns, ok := h.clients[client.UserID]; ok {
				if conns[client] {
					delete(conns, client)
					close(client.Send)
				}
				if len(conns) == 0 {
					delete(h.clients, client.UserID)
					go h.BroadcastPresence(client.UserID.String(), "offline")
				}
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			for _, conns := range h.clients {
				for client := range conns {
					select {
					case client.Send <- message:
					default:
						// Do not modify map or close channel under RLock;
						// slow clients are safely handled by writePump deadline
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// OnlineUserCount returns the number of unique users with at least one live
// WebSocket connection on this backend instance.
func (h *Hub) OnlineUserCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// IsOnline reports whether a user currently has a live WebSocket connection.
func (h *Hub) IsOnline(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.clients[userID]
	return ok
}

func (h *Hub) SendToUser(userID uuid.UUID, eventType string, payload interface{}) {
	rawPayload, _ := json.Marshal(payload)
	evt := Event{
		Type:      eventType,
		Payload:   rawPayload,
		Timestamp: time.Now().UnixMilli(),
	}
	data, _ := json.Marshal(evt)

	h.mu.RLock()
	conns, ok := h.clients[userID]
	if ok {
		for client := range conns {
			select {
			case client.Send <- data:
			default:
			}
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) BroadcastPresence(userID, status string) {
	h.BroadcastEvent("presence_change", map[string]string{
		"user_id": userID,
		"status":  status,
	})
}

func (h *Hub) BroadcastEvent(eventType string, payload interface{}) {
	rawPayload, _ := json.Marshal(payload)
	evt := Event{
		Type:      eventType,
		Payload:   rawPayload,
		Timestamp: time.Now().UnixMilli(),
	}
	data, _ := json.Marshal(evt)
	h.broadcast <- data
}

// ServeWS handles WebSocket upgrading and attaches client to hub
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, authenticator *auth.Authenticator) {
	if !h.isAllowedOrigin(r) {
		http.Error(w, "forbidden origin", http.StatusForbidden)
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	claims, err := authenticator.ValidateToken(token)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS upgrade error: %v", err)
		return
	}

	client := &Client{
		Hub:      h,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		UserID:   claims.UserID,
		Username: claims.Username,
	}

	h.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(1024 * 64) // 64KB
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var event Event
		if err := json.Unmarshal(message, &event); err != nil {
			continue
		}

		// Handle client-side events (e.g. typing, call signaling)
		switch event.Type {
		case "ping":
			select {
			case c.Send <- []byte(`{"type":"pong"}`):
			default:
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Flush queued messages into single frame
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
