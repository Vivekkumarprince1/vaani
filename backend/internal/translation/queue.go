package translation

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"vaani-v2/backend/internal/database"
	"vaani-v2/backend/internal/ws"

	"github.com/google/uuid"
)

// TranslationJob represents an asynchronous translation task
type TranslationJob struct {
	MessageID        uuid.UUID `json:"message_id"`
	RoomID           uuid.UUID `json:"room_id"`
	SenderID         uuid.UUID `json:"sender_id"`
	OriginalText     string    `json:"original_text"`
	OriginalLanguage string    `json:"original_language"`
	TargetLanguages  []string  `json:"target_languages"`
}

type ProviderTranslator interface {
	TranslateBatch(ctx context.Context, texts []string, sourceLang, targetLang string) ([]string, error)
}

// TranslationQueue manages background worker pools for non-blocking translation
type TranslationQueue struct {
	db          *database.DB
	hub         *ws.Hub
	cache       *TwoTierCache
	provider    ProviderTranslator
	jobChan     chan TranslationJob
	workerCount int
	wg          sync.WaitGroup
	ctx         context.Context
	cancel      context.CancelFunc
}

func NewTranslationQueue(
	db *database.DB,
	hub *ws.Hub,
	cache *TwoTierCache,
	provider ProviderTranslator,
	workerCount int,
	queueSize int,
) *TranslationQueue {
	if workerCount <= 0 {
		workerCount = 10
	}
	if queueSize <= 0 {
		queueSize = 10000
	}

	ctx, cancel := context.WithCancel(context.Background())

	q := &TranslationQueue{
		db:          db,
		hub:         hub,
		cache:       cache,
		provider:    provider,
		jobChan:     make(chan TranslationJob, queueSize),
		workerCount: workerCount,
		ctx:         ctx,
		cancel:      cancel,
	}

	q.startWorkers()
	return q
}

func (q *TranslationQueue) startWorkers() {
	for i := 1; i <= q.workerCount; i++ {
		q.wg.Add(1)
		go q.worker(i)
	}
	log.Printf("⚡ TranslationQueue initialized with %d concurrent background workers", q.workerCount)
}

// Enqueue adds a translation job to the non-blocking queue
func (q *TranslationQueue) Enqueue(job TranslationJob) bool {
	select {
	case q.jobChan <- job:
		return true
	default:
		// Queue full under extreme pressure: spawn temporary worker to avoid dropping
		log.Printf("⚠️ TranslationQueue buffer full (%d), executing asynchronously", len(q.jobChan))
		go q.processJob(job)
		return false
	}
}

func (q *TranslationQueue) worker(workerID int) {
	defer q.wg.Done()

	for {
		select {
		case <-q.ctx.Done():
			return
		case job, ok := <-q.jobChan:
			if !ok {
				return
			}
			q.processJob(job)
		}
	}
}

func (q *TranslationQueue) processJob(job TranslationJob) {
	if job.OriginalText == "" || len(job.TargetLanguages) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	translations := make(map[string]string)

	for _, targetLang := range job.TargetLanguages {
		if targetLang == "" || targetLang == job.OriginalLanguage {
			continue
		}

		// Use TwoTierCache with In-Flight Deduplication
		translated, err := q.cache.DoWithDeduplication(ctx, job.OriginalLanguage, targetLang, job.OriginalText, func() (string, error) {
			if q.provider == nil {
				return job.OriginalText, nil
			}
			resList, pErr := q.provider.TranslateBatch(ctx, []string{job.OriginalText}, job.OriginalLanguage, targetLang)
			if pErr != nil || len(resList) == 0 {
				return "", pErr
			}
			return resList[0], nil
		})

		if err == nil && translated != "" {
			translations[targetLang] = translated
		}
	}

	if len(translations) == 0 {
		return
	}

	// 1. Update PostgreSQL message with new translations
	transJSON, err := json.Marshal(translations)
	if err == nil {
		_, _ = q.db.Pool.Exec(ctx,
			`UPDATE messages 
			 SET translations = translations || $1::jsonb 
			 WHERE id = $2`,
			transJSON, job.MessageID,
		)
	}

	// 2. Broadcast translation update via WebSocket to room members
	if q.hub != nil {
		eventData := map[string]interface{}{
			"message_id":   job.MessageID,
			"room_id":      job.RoomID,
			"translations": translations,
		}

		// Send to members of this room
		rows, err := q.db.Pool.Query(ctx, "SELECT user_id FROM room_members WHERE room_id = $1", job.RoomID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var uID uuid.UUID
				if err := rows.Scan(&uID); err == nil {
					q.hub.SendToUser(uID, "chat_message_translation", eventData)
				}
			}
		}
	}
}

// Stop gracefully stops all workers and drains queue
func (q *TranslationQueue) Stop() {
	q.cancel()
	close(q.jobChan)
	q.wg.Wait()
	log.Println("🛑 TranslationQueue workers stopped cleanly")
}
