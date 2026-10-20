package translation

import (
	"container/list"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"sync"
	"time"

	"vaani-v2/backend/internal/redis"

	"golang.org/x/sync/singleflight"
)

type lruItem struct {
	key       string
	value     string
	expiresAt time.Time
}

// MemoryLRU is a thread-safe, TTL-aware in-memory LRU cache
type MemoryLRU struct {
	mu       sync.Mutex
	capacity int
	items    map[string]*list.Element
	evict    *list.List
}

func NewMemoryLRU(capacity int) *MemoryLRU {
	if capacity <= 0 {
		capacity = 10000
	}
	return &MemoryLRU{
		capacity: capacity,
		items:    make(map[string]*list.Element),
		evict:    list.New(),
	}
}

func (c *MemoryLRU) Get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	elem, exists := c.items[key]
	if !exists {
		return "", false
	}

	item := elem.Value.(*lruItem)
	if time.Now().After(item.expiresAt) {
		c.evict.Remove(elem)
		delete(c.items, key)
		return "", false
	}

	c.evict.MoveToFront(elem)
	return item.value, true
}

func (c *MemoryLRU) Set(key, value string, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	expiresAt := now.Add(ttl)

	if elem, exists := c.items[key]; exists {
		c.evict.MoveToFront(elem)
		item := elem.Value.(*lruItem)
		item.value = value
		item.expiresAt = expiresAt
		return
	}

	if c.evict.Len() >= c.capacity {
		oldest := c.evict.Back()
		if oldest != nil {
			c.evict.Remove(oldest)
			delete(c.items, oldest.Value.(*lruItem).key)
		}
	}

	elem := c.evict.PushFront(&lruItem{
		key:       key,
		value:     value,
		expiresAt: expiresAt,
	})
	c.items[key] = elem
}

// TwoTierCache combines In-Memory LRU + Redis Distributed Cache + In-Flight Deduplication
type TwoTierCache struct {
	lru   *MemoryLRU
	redis *redis.Client
	group singleflight.Group
	ttl   time.Duration
}

func NewTwoTierCache(redisClient *redis.Client, lruCapacity int, defaultTTL time.Duration) *TwoTierCache {
	if defaultTTL <= 0 {
		defaultTTL = 24 * time.Hour
	}
	return &TwoTierCache{
		lru:   NewMemoryLRU(lruCapacity),
		redis: redisClient,
		ttl:   defaultTTL,
	}
}

// BuildCacheKey creates a SHA-256 fingerprint for the translation tuple
func (c *TwoTierCache) BuildCacheKey(sourceLang, targetLang, text string) string {
	normalized := strings.TrimSpace(strings.ToLower(text))
	s := fmt.Sprintf("%s:%s:%s", strings.ToLower(sourceLang), strings.ToLower(targetLang), normalized)
	hash := sha256.Sum256([]byte(s))
	return "vaani:trans:" + hex.EncodeToString(hash[:])
}

// Get checks In-Memory LRU first, then Redis
func (c *TwoTierCache) Get(ctx context.Context, sourceLang, targetLang, text string) (string, bool) {
	key := c.BuildCacheKey(sourceLang, targetLang, text)

	// Level 1: In-Memory LRU (< 5 microseconds)
	if val, ok := c.lru.Get(key); ok {
		return val, true
	}

	// Level 2: Redis Distributed Cache (< 2 milliseconds)
	if c.redis != nil && c.redis.Rdb != nil {
		rCtx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
		val, err := c.redis.Rdb.Get(rCtx, key).Result()
		cancel()
		if err == nil && val != "" {
			// Populate Level 1 for subsequent fast hits
			c.lru.Set(key, val, c.ttl)
			return val, true
		}
	}

	return "", false
}

// Set stores the translation in both In-Memory LRU and Redis
func (c *TwoTierCache) Set(ctx context.Context, sourceLang, targetLang, text, translation string) {
	if translation == "" {
		return
	}
	key := c.BuildCacheKey(sourceLang, targetLang, text)

	// Store in Level 1
	c.lru.Set(key, translation, c.ttl)

	// Store in Level 2 (Redis) with bounded timeout
	if c.redis != nil && c.redis.Rdb != nil {
		rCtx, cancel := context.WithTimeout(ctx, 300*time.Millisecond)
		_ = c.redis.Rdb.Set(rCtx, key, translation, c.ttl).Err()
		cancel()
	}
}

// DoWithDeduplication executes the translation fetcher using SingleFlight
// If multiple concurrent requests ask for the same translation, only one API call is executed.
func (c *TwoTierCache) DoWithDeduplication(ctx context.Context, sourceLang, targetLang, text string, fetcher func() (string, error)) (string, error) {
	// First check cache
	if val, hit := c.Get(ctx, sourceLang, targetLang, text); hit {
		return val, nil
	}

	key := c.BuildCacheKey(sourceLang, targetLang, text)

	// Singleflight deduplication across concurrent goroutines
	res, err, _ := c.group.Do(key, func() (interface{}, error) {
		// Double check cache inside flight
		if val, hit := c.Get(ctx, sourceLang, targetLang, text); hit {
			return val, nil
		}

		translated, fErr := fetcher()
		if fErr != nil {
			return "", fErr
		}

		if translated != "" {
			c.Set(ctx, sourceLang, targetLang, text, translated)
		}
		return translated, nil
	})

	if err != nil {
		return "", err
	}
	return res.(string), nil
}
