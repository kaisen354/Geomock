package loadtest

import (
	"context"
	"encoding/json"
	"sort"
	"time"
)

type MetricsPayload struct {
	TotalRequestsMade int `json:"totalRequestsMade"`
	CurrentRPS        int `json:"currentRps"`
	HTTPFailures      int `json:"httpFailures"`
	P95ResponseTime   int `json:"p95ResponseTime"` // in ms
}

type MetricsAggregator struct {
	statsChan <-chan RequestStat
	broadcast func([]byte) // function to broadcast JSON to WS
}

func NewMetricsAggregator(statsChan <-chan RequestStat, broadcast func([]byte)) *MetricsAggregator {
	return &MetricsAggregator{
		statsChan: statsChan,
		broadcast: broadcast,
	}
}

func (ma *MetricsAggregator) Start(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	var totalRequestsMade int
	var totalHTTPFailures int

	// Window state
	var currentWindowReqs int
	var windowLatencies []time.Duration

	for {
		select {
		case <-ctx.Done():
			return
		case stat := <-ma.statsChan:
			totalRequestsMade++
			currentWindowReqs++

			if stat.Code < 200 || stat.Code >= 300 {
				totalHTTPFailures++
			}

			windowLatencies = append(windowLatencies, stat.Latency)
		case <-ticker.C:
			// Calculate P95
			var p95 time.Duration
			if len(windowLatencies) > 0 {
				sort.Slice(windowLatencies, func(i, j int) bool {
					return windowLatencies[i] < windowLatencies[j]
				})
				idx := int(float64(len(windowLatencies)) * 0.95)
				if idx >= len(windowLatencies) {
					idx = len(windowLatencies) - 1
				}
				p95 = windowLatencies[idx]
			}

			payload := MetricsPayload{
				TotalRequestsMade: totalRequestsMade,
				CurrentRPS:        currentWindowReqs,
				HTTPFailures:      totalHTTPFailures,
				P95ResponseTime:   int(p95.Milliseconds()),
			}

			data, err := json.Marshal(payload)
			if err == nil {
				ma.broadcast(data)
			}

			// Reset window state
			currentWindowReqs = 0
			windowLatencies = windowLatencies[:0]
		}
	}
}
