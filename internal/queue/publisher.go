package queue

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type TelemetryPublisher struct {
	IngestionChan chan Telemetry
	BridgeChan    chan Telemetry // direct WS bridge — bypasses Redis
	client        *redis.Client
	streamName    string
}

func NewTelemetryPublisher(client *redis.Client, streamName string) *TelemetryPublisher {
	return &TelemetryPublisher{
		IngestionChan: make(chan Telemetry, 10000), // Buffered channel to handle spikes
		BridgeChan:    make(chan Telemetry, 10000), // Mirror channel for direct WS bridge
		client:        client,
		streamName:    streamName,
	}
}

func (p *TelemetryPublisher) StartPublishingLoop(ctx context.Context) {
	ticker := time.NewTicker(100 * time.Millisecond) // Flush every 100ms
	defer ticker.Stop()

	var batch []Telemetry

	for {
		select {
		case <-ctx.Done():
			// Flush remaining before shutdown
			p.flushBatch(context.Background(), batch)
			return
		case t := <-p.IngestionChan:
			// Fan-out: forward to both Redis pipeline and the direct WS bridge.
			// Non-blocking send to bridge so a slow WS consumer never stalls agents.
			select {
			case p.BridgeChan <- t:
			default:
				// Bridge channel full — drop frame (same backpressure policy as Redis path)
			}

			batch = append(batch, t)
			if len(batch) >= 1000 {
				p.flushBatch(ctx, batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				p.flushBatch(ctx, batch)
				batch = batch[:0]
			}
		}
	}
}

func (p *TelemetryPublisher) flushBatch(ctx context.Context, batch []Telemetry) {
	if len(batch) == 0 {
		return
	}

	pipeline := p.client.Pipeline()
	for _, t := range batch {
		data, err := json.Marshal(t)
		if err != nil {
			log.Printf("Failed to marshal telemetry: %v\n", err)
			continue
		}
		pipeline.XAdd(ctx, &redis.XAddArgs{
			Stream: p.streamName,
			Values: map[string]interface{}{
				"payload": string(data),
			},
		})
	}

	_, err := pipeline.Exec(ctx)
	if err != nil {
		log.Printf("warning: Failed to flush telemetry batch to Redis: %v\n", err)
	}
}
