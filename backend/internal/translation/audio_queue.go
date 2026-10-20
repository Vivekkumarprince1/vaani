package translation

import (
	"sync"
	"time"
)

// AudioChunk represents a translated audio packet for a call participant
type AudioChunk struct {
	Seq       int64     `json:"seq"`
	RoomID    string    `json:"room_id"`
	SpeakerID string    `json:"speaker_id"`
	Language  string    `json:"language"`
	PCMData   []byte    `json:"pcm_data"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"created_at"`
}

// RoomAudioQueue guarantees strict in-order sequential audio playback per room
type RoomAudioQueue struct {
	mu     sync.Mutex
	queues map[string]chan AudioChunk // room_id -> chunk channel
}

func NewRoomAudioQueue() *RoomAudioQueue {
	return &RoomAudioQueue{
		queues: make(map[string]chan AudioChunk),
	}
}

// GetOrCreateRoomQueue returns or creates a buffered channel for a specific call room
func (q *RoomAudioQueue) GetOrCreateRoomQueue(roomID string, bufferSize int) chan AudioChunk {
	q.mu.Lock()
	defer q.mu.Unlock()

	if ch, exists := q.queues[roomID]; exists {
		return ch
	}

	if bufferSize <= 0 {
		bufferSize = 256
	}

	ch := make(chan AudioChunk, bufferSize)
	q.queues[roomID] = ch
	return ch
}

// RemoveRoomQueue closes and cleans up a room audio queue when the call ends
func (q *RoomAudioQueue) RemoveRoomQueue(roomID string) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if ch, exists := q.queues[roomID]; exists {
		close(ch)
		delete(q.queues, roomID)
	}
}
