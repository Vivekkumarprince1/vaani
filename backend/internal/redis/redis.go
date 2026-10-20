package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type Client struct {
	Rdb *redis.Client
}

func Connect(redisURL string) (*Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis url: %w", err)
	}

	rdb := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping redis: %w", err)
	}

	log.Println("✅ Redis connected successfully")
	return &Client{Rdb: rdb}, nil
}

// UserPresence represents online status cached in Redis
type UserPresence struct {
	UserID            string `json:"user_id"`
	Username          string `json:"username"`
	PreferredLanguage string `json:"preferred_language"`
	Status            string `json:"status"` // online, in_call, offline
	LastHeartbeat     int64  `json:"last_heartbeat"`
}

func (c *Client) SetPresence(ctx context.Context, p UserPresence) error {
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	key := fmt.Sprintf("vaani:presence:%s", p.UserID)
	return c.Rdb.Set(ctx, key, data, 10*time.Minute).Err()
}

func (c *Client) GetPresence(ctx context.Context, userID string) (*UserPresence, error) {
	key := fmt.Sprintf("vaani:presence:%s", userID)
	data, err := c.Rdb.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}
	var p UserPresence
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (c *Client) RemovePresence(ctx context.Context, userID string) error {
	key := fmt.Sprintf("vaani:presence:%s", userID)
	return c.Rdb.Del(ctx, key).Err()
}

func (c *Client) PublishConfigReload(ctx context.Context, category string) error {
	return c.Rdb.Publish(ctx, "vaani:config:reload", category).Err()
}
