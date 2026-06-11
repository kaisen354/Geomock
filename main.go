package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"geomock/internal/ai"
	"geomock/internal/api"
	"geomock/internal/engine"
	"geomock/internal/graph"
	"geomock/internal/loadtest"
	"geomock/internal/queue"

	"github.com/redis/go-redis/v9"
)

// ─────────────────────────────────────────────────────────────
// Global simulation state (protected by simMu)
// ─────────────────────────────────────────────────────────────
var (
	simMu      sync.RWMutex
	simEngine  *engine.SimulationEngine
	simAgents  []*engine.DriverAgent
	overseer   *ai.OverseerAgent
	simGraph   *graph.Graph
)

// corsMiddleware allows the Vite dev server (and any other origin) to reach the API.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ─────────────────────────────────────────────────────────────
// GeoJSON bounding envelope helpers
// ─────────────────────────────────────────────────────────────

type BoundingEnvelope struct {
	MinLat float64 `json:"minLat"`
	MaxLat float64 `json:"maxLat"`
	MinLng float64 `json:"minLng"`
	MaxLng float64 `json:"maxLng"`
}

// extractEnvelope walks any GeoJSON FeatureCollection and returns the bounding box
// of all coordinate pairs it finds.
func extractEnvelope(raw map[string]interface{}) (BoundingEnvelope, error) {
	env := BoundingEnvelope{
		MinLat: math.MaxFloat64,
		MaxLat: -math.MaxFloat64,
		MinLng: math.MaxFloat64,
		MaxLng: -math.MaxFloat64,
	}

	var walk func(v interface{})
	walk = func(v interface{}) {
		switch node := v.(type) {
		case []interface{}:
			// Check if this looks like a [lng, lat] coordinate pair
			if len(node) >= 2 {
				if lng, ok1 := node[0].(float64); ok1 {
					if lat, ok2 := node[1].(float64); ok2 {
						// Sanity-check: valid lat/lng ranges
						if lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 {
							if lat < env.MinLat {
								env.MinLat = lat
							}
							if lat > env.MaxLat {
								env.MaxLat = lat
							}
							if lng < env.MinLng {
								env.MinLng = lng
							}
							if lng > env.MaxLng {
								env.MaxLng = lng
							}
							return
						}
					}
				}
			}
			for _, item := range node {
				walk(item)
			}
		case map[string]interface{}:
			for _, val := range node {
				walk(val)
			}
		}
	}

	walk(raw)

	if env.MinLat == math.MaxFloat64 {
		return env, fmt.Errorf("no valid coordinates found in GeoJSON")
	}
	return env, nil
}

// rescatterAgents relocates every agent to a random position inside the given envelope.
func rescatterAgents(env BoundingEnvelope) {
	simMu.Lock()
	defer simMu.Unlock()

	latRange := env.MaxLat - env.MinLat
	lngRange := env.MaxLng - env.MinLng

	for _, agent := range simAgents {
		lat := env.MinLat + rand.Float64()*latRange
		lng := env.MinLng + rand.Float64()*lngRange
		agent.Rescatter(lat, lng)
	}
}

// cityBounds returns a hardcoded BoundingEnvelope for a named city.
// Returns false if the city is not recognised.
func cityBounds(city string) (BoundingEnvelope, bool) {
	switch strings.ToLower(strings.TrimSpace(city)) {
	case "san francisco", "sf":
		return BoundingEnvelope{MinLat: 37.70, MaxLat: 37.84, MinLng: -122.53, MaxLng: -122.35}, true
	case "new york", "nyc", "new york city":
		return BoundingEnvelope{MinLat: 40.60, MaxLat: 40.85, MinLng: -74.05, MaxLng: -73.87}, true
	case "london":
		return BoundingEnvelope{MinLat: 51.40, MaxLat: 51.60, MinLng: -0.25, MaxLng: 0.01}, true
	case "tokyo":
		return BoundingEnvelope{MinLat: 35.55, MaxLat: 35.82, MinLng: 139.60, MaxLng: 139.90}, true
	}
	return BoundingEnvelope{}, false
}

func main() {
	fmt.Println("Initializing GeoMock Phase 4 Pipeline — Overseer AI enabled...")

	// ── 1. Redis Configuration ───────────────────────────────
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "localhost:6379"
	}
	redisClient := redis.NewClient(&redis.Options{
		Addr:     redisURL,
		PoolSize: 100,
	})

	streamName := "telemetry:stream"

	// ── 2. Initialize Queue Components ──────────────────────
	publisher := queue.NewTelemetryPublisher(redisClient, streamName)
	wsHub := api.NewWebSocketHub()
	consumer := queue.NewTelemetryConsumer(redisClient, streamName, wsHub)

	// ── 3. Initialize Core Engine ────────────────────────────
	simEngine = engine.NewSimulationEngine(publisher.IngestionChan)

	// ── 3b. Initialize Overseer AI Agent ─────────────────────
	overseer = ai.NewOverseerAgent()

	for i := 0; i < 1000; i++ {
		id := "agent_" + strconv.Itoa(i)
		agent := &engine.DriverAgent{
			ID:                   id,
			Lat:                  37.7749 + float64(i)*0.0001,
			Lng:                  -122.4194 + float64(i)*0.0001,
			Speed:                0.001,
			CurrentWaypointIndex: 0,
			Route: []engine.Coordinate{
				{Lat: 37.8000, Lng: -122.4000},
				{Lat: 37.9000, Lng: -122.3000},
			},
		}
		simEngine.AddAgent(agent)
		simAgents = append(simAgents, agent)
	}

	fmt.Println("Generated 1000 agents.")

	// ── 4. Setup Contexts ────────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── 5. Start Background Workers ──────────────────────────

	// Initialize Webhook Forwarder for Load Testing
	webhookTarget := os.Getenv("WEBHOOK_TARGET_URL")
	if webhookTarget == "" {
		webhookTarget = "http://localhost:9999/ingest" // default dummy endpoint
	}
	webhookForwarder := loadtest.NewWebhookForwarder(webhookTarget)
	webhookForwarder.Start(ctx)

	// Initialize Metrics Aggregator & WebSocket Hub
	metricsHub := api.NewWebSocketHub()
	metricsAggregator := loadtest.NewMetricsAggregator(webhookForwarder.StatsChan, metricsHub.Broadcast)
	go metricsAggregator.Start(ctx)

	// Direct WS bridge — broadcasts telemetry straight from the ingestion
	// channel to connected WebSocket clients without touching Redis.
	// This guarantees live data even when Redis is unavailable.
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		var batch []queue.Telemetry
		for {
			select {
			case <-ctx.Done():
				return
			case t := <-publisher.BridgeChan:
				batch = append(batch, t)
			case <-ticker.C:
				if len(batch) == 0 {
					continue
				}
				data, err := json.Marshal(batch)
				if err == nil {
					wsHub.Broadcast(data)
					
					// Non-blocking send to Webhook Forwarder
					select {
					case webhookForwarder.PayloadCh <- data:
					default:
						// Drop payload if forwarder is overwhelmed to avoid blocking the WS loop
					}
				}
				batch = batch[:0]
			}
		}
	}()

	go publisher.StartPublishingLoop(ctx)
	go consumer.StartConsumingLoop(ctx)
	go wsHub.Run(ctx)
	go metricsHub.Run(ctx)

	// ── 6. Setup HTTP Routes ─────────────────────────────────
	mux := http.NewServeMux()

	// WebSocket — /ws/live (renamed from /ws)
	mux.HandleFunc("/ws/live", wsHub.ServeWS)
	// WebSocket — /ws/metrics
	mux.HandleFunc("/ws/metrics", metricsHub.ServeWS)

	// POST /api/start — trigger simulation engine
	mux.HandleFunc("/api/start", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Count    int `json:"count"`
			TickRate int `json:"tickRate"`
		}
		
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			fmt.Printf("Starting engine via API trigger: %d agents, %d ms tick\n", req.Count, req.TickRate)
			
			if req.Count <= 0 {
				req.Count = 1000
			}
			if req.TickRate <= 0 {
				req.TickRate = 1000
			}

			simMu.Lock()
			newAgents := make([]*engine.DriverAgent, req.Count)
			for i := 0; i < req.Count; i++ {
				id := "agent_" + strconv.Itoa(i)
				newAgents[i] = &engine.DriverAgent{
					ID:                   id,
					Lat:                  37.7749 + (rand.Float64()-0.5)*0.1,
					Lng:                  -122.4194 + (rand.Float64()-0.5)*0.1,
					Speed:                0.001,
					CurrentWaypointIndex: 0,
					TickRate:             req.TickRate,
					Route: []engine.Coordinate{
						{Lat: 37.7749 + (rand.Float64()-0.5)*0.1, Lng: -122.4194 + (rand.Float64()-0.5)*0.1},
						{Lat: 37.7749 + (rand.Float64()-0.5)*0.1, Lng: -122.4194 + (rand.Float64()-0.5)*0.1},
					},
				}
			}
			simAgents = newAgents
			simEngine.SetAgents(newAgents)
			simMu.Unlock()
		} else {
			fmt.Println("Starting engine with default settings (decode error)")
		}

		simEngine.Start(ctx)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"started"}`))
	})

	// POST /api/chat — Overseer AI natural language control interface
	mux.HandleFunc("/api/chat", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse request body
		var req struct {
			Message string `json:"message"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Message) == "" {
			http.Error(w, `{"error":"message field required"}`, http.StatusBadRequest)
			return
		}

		// Call the Overseer AI
		result, err := overseer.Chat(r.Context(), req.Message)
		if err != nil {
			log.Printf("[Overseer] Chat error: %v", err)
			http.Error(w, `{"error":"AI backend error"}`, http.StatusInternalServerError)
			return
		}

		// ── Response payload ──────────────────────────────────
		type chatResponse struct {
			Reply  string           `json:"reply"`
			Bounds *BoundingEnvelope `json:"bounds,omitempty"`
		}
		resp := chatResponse{Reply: result.Reply}

		// ── If Gemini invoked the control_simulation tool ─────
		if result.Call != nil {
			call := result.Call
			fmt.Printf("[Overseer] control_simulation: agents=%d tick=%dms city=%q\n",
				call.AgentCount, call.TickRateMs, call.TargetCity)

			// 1. Rebuild agents slice (hold simMu only for this)
			newAgents := make([]*engine.DriverAgent, call.AgentCount)
			for i := 0; i < call.AgentCount; i++ {
				id := "agent_" + strconv.Itoa(i)
				newAgents[i] = &engine.DriverAgent{
					ID:                   id,
					Lat:                  37.7749 + (rand.Float64()-0.5)*0.1,
					Lng:                  -122.4194 + (rand.Float64()-0.5)*0.1,
					Speed:                0.001,
					CurrentWaypointIndex: 0,
					TickRate:             call.TickRateMs,
					Route: []engine.Coordinate{
						{Lat: 37.7749 + (rand.Float64()-0.5)*0.1, Lng: -122.4194 + (rand.Float64()-0.5)*0.1},
						{Lat: 37.7749 + (rand.Float64()-0.5)*0.1, Lng: -122.4194 + (rand.Float64()-0.5)*0.1},
					},
				}
			}
			simMu.Lock()
			simAgents = newAgents
			simMu.Unlock()

			// 2. Apply to engine (engine has its own internal lock)
			simEngine.SetAgents(newAgents)
			simEngine.Start(ctx)

			// 3. Optionally teleport to city
			if call.TargetBounds != nil {
				env := BoundingEnvelope{
					MinLat: call.TargetBounds.MinLat,
					MaxLat: call.TargetBounds.MaxLat,
					MinLng: call.TargetBounds.MinLng,
					MaxLng: call.TargetBounds.MaxLng,
				}
				rescatterAgents(env) // acquires simMu internally
				resp.Bounds = &env
				fmt.Printf("[Overseer] Scattered agents to %s via AI bounds: %.2f,%.2f → %.2f,%.2f\n",
					call.TargetCity, env.MinLat, env.MinLng, env.MaxLat, env.MaxLng)
			} else if call.TargetCity != "" {
				if env, ok := cityBounds(call.TargetCity); ok {
					rescatterAgents(env) // acquires simMu internally
					resp.Bounds = &env
					fmt.Printf("[Overseer] Scattered agents to %s: %.2f,%.2f → %.2f,%.2f\n",
						call.TargetCity, env.MinLat, env.MinLng, env.MaxLat, env.MaxLng)
				} else {
					log.Printf("[Overseer] Unrecognised city: %q — skipping teleport", call.TargetCity)
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	})

	// POST /api/upload-map — multipart GeoJSON ingestion
	mux.HandleFunc("/api/upload-map", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Parse multipart form (max 50 MB)
		if err := r.ParseMultipartForm(50 << 20); err != nil {
			http.Error(w, "failed to parse multipart form: "+err.Error(), http.StatusBadRequest)
			return
		}

		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "missing 'file' field in form: "+err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()

		data, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, "failed to read file: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Validate GeoJSON structure
		var geoJSON map[string]interface{}
		if err := json.Unmarshal(data, &geoJSON); err != nil {
			http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}
		if t, _ := geoJSON["type"].(string); t != "FeatureCollection" {
			http.Error(w, "GeoJSON must be a FeatureCollection", http.StatusBadRequest)
			return
		}

		// Extract bounding envelope
		env, err := extractEnvelope(geoJSON)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Parse graph
		if newGraph, err := graph.ParseGeoJSON(data); err == nil {
			simMu.Lock()
			simGraph = newGraph
			simMu.Unlock()
			simEngine.SetGraph(newGraph)
			fmt.Printf("Graph built: %d valid nodes connected\n", len(newGraph.Nodes))
		} else {
			fmt.Printf("Warning: failed to build graph from GeoJSON: %v\n", err)
		}

		// Rescatter all agents inside the new city bounds
		rescatterAgents(env)
		fmt.Printf("Map uploaded: envelope %.4f,%.4f → %.4f,%.4f\n",
			env.MinLat, env.MinLng, env.MaxLat, env.MaxLng)

		// Return envelope for frontend flyTo
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(env)
	})

	// Wrap the entire mux with CORS middleware
	handler := corsMiddleware(mux)

	// Start HTTP server in background
	go func() {
		fmt.Println("Server listening on :8080")
		if err := http.ListenAndServe(":8080", handler); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// ── 7. Block until SIGINT / SIGTERM (Ctrl+C) ────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	// Print a memory snapshot every 30 s so you can watch resource usage
	memTicker := time.NewTicker(30 * time.Second)
	defer memTicker.Stop()

	fmt.Println("GeoMock backend running — press Ctrl+C to stop")

loop:
	for {
		select {
		case <-quit:
			break loop
		case <-memTicker.C:
			printMemStats()
		}
	}

	fmt.Println("Shutting down engine...")
	cancel()
	time.Sleep(500 * time.Millisecond)
	fmt.Println("Engine shutdown complete.")
}

func printMemStats() {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	fmt.Printf("Alloc = %v MiB\tTotalAlloc = %v MiB\tSys = %v MiB\tNumGC = %v\tGoroutines = %v\n",
		bToMb(m.Alloc),
		bToMb(m.TotalAlloc),
		bToMb(m.Sys),
		m.NumGC,
		runtime.NumGoroutine(),
	)
}

func bToMb(b uint64) uint64 {
	return b / 1024 / 1024
}
