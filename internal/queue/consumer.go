package queue

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"geomock/internal/api"

	"github.com/redis/go-redis/v9"
)

type TelemetryConsumer struct {
	client     *redis.Client
	streamName string
	hub        *api.WebSocketHub
}

func NewTelemetryConsumer(client *redis.Client, streamName string, hub *api.WebSocketHub) *TelemetryConsumer {
	return &TelemetryConsumer{
		client:     client,
		streamName: streamName,
		hub:        hub,
	}
}

func (c *TelemetryConsumer) StartConsumingLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second) // Exactly once per second broadcast
	defer ticker.Stop()

	lastID := "$" // Start reading new messages from now

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Read from Redis Stream
			args := &redis.XReadArgs{
				Streams: []string{c.streamName, lastID},
				Count:   5000,
				Block:   0, // Non-blocking read since we are on a ticker
			}

			streams, err := c.client.XRead(ctx, args).Result()
			if err != nil && err != redis.Nil {
				log.Printf("Failed to read from telemetry stream: %v\n", err)
				continue
			}

			if len(streams) == 0 || len(streams[0].Messages) == 0 {
				continue // Nothing to broadcast
			}

			var aggregated []Telemetry

			for _, msg := range streams[0].Messages {
				lastID = msg.ID // Update cursor
				payloadStr, ok := msg.Values["payload"].(string)
				if !ok {
					continue
				}

				var t Telemetry
				if err := json.Unmarshal([]byte(payloadStr), &t); err != nil {
					continue
				}
				aggregated = append(aggregated, t)
			}

			// Note: The Direct WS bridge in main.go already broadcasts to WebSocket clients
			// bypassing Redis to guarantee live data. To prevent duplicating telemetry frames,
			// the Redis consumer does NOT broadcast to the hub.
			// if len(aggregated) > 0 {
			// 	packet, err := json.Marshal(aggregated)
			// 	if err == nil {
			// 		c.hub.Broadcast(packet)
			// 	}
			// }
		}
	}
}
