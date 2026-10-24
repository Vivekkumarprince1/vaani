package livekit

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

type Manager struct {
	apiKey    string
	apiSecret string
	hostURL   string
	roomCli   *lksdk.RoomServiceClient
}

func NewManager(hostURL, apiKey, apiSecret string) *Manager {
	var roomCli *lksdk.RoomServiceClient
	if hostURL != "" && apiKey != "" && apiSecret != "" {
		roomCli = lksdk.NewRoomServiceClient(hostURL, apiKey, apiSecret)
	}

	return &Manager{
		apiKey:    apiKey,
		apiSecret: apiSecret,
		hostURL:   hostURL,
		roomCli:   roomCli,
	}
}

// GetHostURL returns configured LiveKit host URL
func (m *Manager) GetHostURL() string {
	return m.hostURL
}

// GenerateToken creates a signed LiveKit JWT access token for a participant
func (m *Manager) GenerateToken(roomSlug, identity, name, metadata string) (string, error) {
	if m.apiKey == "" || m.apiSecret == "" {
		return "", fmt.Errorf("livekit api credentials not configured")
	}

	at := auth.NewAccessToken(m.apiKey, m.apiSecret)
	canPublish := true
	canSubscribe := true
	canPublishData := true
	canUpdateOwnMetadata := true

	grant := &auth.VideoGrant{
		RoomJoin:             true,
		Room:                 roomSlug,
		CanPublish:           &canPublish,
		CanSubscribe:         &canSubscribe,
		CanPublishData:       &canPublishData,
		CanUpdateOwnMetadata: &canUpdateOwnMetadata,
	}

	at.AddGrant(grant).
		SetIdentity(identity).
		SetName(name).
		SetValidFor(6 * time.Hour)

	if metadata != "" {
		at.SetMetadata(metadata)
	}

	return at.ToJWT()
}

// EnsureRoom ensures the LiveKit room exists
func (m *Manager) EnsureRoom(ctx context.Context, roomSlug string) error {
	if m.roomCli == nil || roomSlug == "" {
		return nil
	}

	rooms, err := m.roomCli.ListRooms(ctx, &livekit.ListRoomsRequest{})
	if err != nil {
		return fmt.Errorf("list LiveKit rooms: %w", err)
	}
	for _, room := range rooms.Rooms {
		if room != nil && room.Name == roomSlug {
			return nil
		}
	}

	_, err = m.roomCli.CreateRoom(ctx, &livekit.CreateRoomRequest{
		Name:            roomSlug,
		EmptyTimeout:    300, // 5 minutes
		MaxParticipants: 100,
	})
	if err != nil {
		log.Printf("LiveKit ensure room failed: %v", err)
		return err
	}
	return nil
}

// DeleteRoom ends an active LiveKit room
func (m *Manager) DeleteRoom(ctx context.Context, roomSlug string) error {
	if m.roomCli == nil {
		return nil
	}
	_, err := m.roomCli.DeleteRoom(ctx, &livekit.DeleteRoomRequest{Room: roomSlug})
	return err
}

// ListParticipants returns current participants in room
func (m *Manager) ListParticipants(ctx context.Context, roomSlug string) ([]*livekit.ParticipantInfo, error) {
	if m.roomCli == nil {
		return nil, nil
	}
	res, err := m.roomCli.ListParticipants(ctx, &livekit.ListParticipantsRequest{Room: roomSlug})
	if err != nil {
		return nil, err
	}
	return res.Participants, nil
}

// ListRooms returns all active rooms directly from LiveKit SFU
func (m *Manager) ListRooms(ctx context.Context) ([]*livekit.Room, error) {
	if m.roomCli == nil {
		return nil, nil
	}
	res, err := m.roomCli.ListRooms(ctx, &livekit.ListRoomsRequest{})
	if err != nil {
		return nil, err
	}
	return res.Rooms, nil
}
