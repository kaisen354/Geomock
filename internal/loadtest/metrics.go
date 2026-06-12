package loadtest

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"sync/atomic"
	"time"
)

// TopologyNode represents a single node in the service map.
type TopologyNode struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Group  string  `json:"group"`
	Val    float64 `json:"val"`   // used for visual weight
	Color  string  `json:"color"` // css color string
	Stat   string  `json:"stat"`
	Status string  `json:"status"` // "healthy", "degraded", "failing"
}

// TopologyLink represents a directed edge between two nodes.
type TopologyLink struct {
	Source     string  `json:"source"`
	Target     string  `json:"target"`
	Throughput float64 `json:"throughput"` // traffic intensity (drives particle speed)
	Particles  int     `json:"particles"`  // particle count hint
	Color      string  `json:"color,omitempty"`
}

// TopologyData is the graph payload consumed by react-force-graph-2d.
type TopologyData struct {
	Nodes []TopologyNode `json:"nodes"`
	Links []TopologyLink `json:"links"`
}

type MetricsPayload struct {
	TotalRequestsMade int           `json:"totalRequestsMade"`
	CurrentRPS        int           `json:"currentRps"`
	HTTPFailures      int           `json:"httpFailures"`
	P95ResponseTime   int           `json:"p95ResponseTime"` // in ms
	
	// Extended metrics
	P50ResponseTime   int           `json:"p50ResponseTime"`
	P90ResponseTime   int           `json:"p90ResponseTime"`
	P99ResponseTime   int           `json:"p99ResponseTime"`
	AvgTTFB           int           `json:"avgTtfb"`
	ActiveConnections int           `json:"activeConnections"`
	StatusCounts      map[int]int   `json:"statusCounts"`
	
	Topology          *TopologyData `json:"topology"`
}

type MetricsAggregator struct {
	statsChan <-chan ExtendedRequestStat
	broadcast func([]byte) // function to broadcast JSON to WS
	
	engine    *LoadTestEngine // optional, to fetch active connections

	// atomic counters readable by the topology goroutine without a lock
	atomicRPS      atomic.Int64
	atomicTotal    atomic.Int64
	atomicFailures atomic.Int64
	atomicP50ms    atomic.Int64
	atomicP90ms    atomic.Int64
	atomicP95ms    atomic.Int64
	atomicP99ms    atomic.Int64
	atomicTTFB     atomic.Int64
}

func NewMetricsAggregator(statsChan <-chan ExtendedRequestStat, broadcast func([]byte)) *MetricsAggregator {
	return &MetricsAggregator{
		statsChan: statsChan,
		broadcast: broadcast,
	}
}

func (ma *MetricsAggregator) SetEngine(engine *LoadTestEngine) {
	ma.engine = engine
}

func (ma *MetricsAggregator) Start(ctx context.Context) {
	// ── goroutine 1: drain statsChan and compute metrics every second ──────
	go ma.drainLoop(ctx)

	// ── goroutine 2: broadcast full payload (metrics + topology) every second
	//    This ticker is DEDICATED so it can never be starved by statsChan.
	ma.broadcastLoop(ctx)
}

// drainLoop continuously drains statsChan and updates the atomic counters.
// It uses a non-blocking drain inside a 1-second tick to avoid starvation.
func (ma *MetricsAggregator) drainLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	var totalRequestsMade int64
	var totalHTTPFailures int64
	var windowLatencies []time.Duration
	var windowTTFB []time.Duration

	for {
		select {
		case <-ctx.Done():
			return

		case stat := <-ma.statsChan:
			totalRequestsMade++
			if stat.Code < 200 || stat.Code >= 300 {
				totalHTTPFailures++
			}
			windowLatencies = append(windowLatencies, stat.Latency)
			windowTTFB = append(windowTTFB, stat.TTFB)

		case <-ticker.C:
			// Drain any remaining items in this window (non-blocking burst read)
		drainBurst:
			for {
				select {
				case stat := <-ma.statsChan:
					totalRequestsMade++
					if stat.Code < 200 || stat.Code >= 300 {
						totalHTTPFailures++
					}
					windowLatencies = append(windowLatencies, stat.Latency)
					windowTTFB = append(windowTTFB, stat.TTFB)
				default:
					break drainBurst
				}
			}

			// Calculate percentiles
			var p50ms, p90ms, p95ms, p99ms int64
			if len(windowLatencies) > 0 {
				sort.Slice(windowLatencies, func(i, j int) bool {
					return windowLatencies[i] < windowLatencies[j]
				})
				
				idx50 := int(float64(len(windowLatencies)) * 0.50)
				idx90 := int(float64(len(windowLatencies)) * 0.90)
				idx95 := int(float64(len(windowLatencies)) * 0.95)
				idx99 := int(float64(len(windowLatencies)) * 0.99)
				
				if idx50 >= len(windowLatencies) { idx50 = len(windowLatencies) - 1 }
				if idx90 >= len(windowLatencies) { idx90 = len(windowLatencies) - 1 }
				if idx95 >= len(windowLatencies) { idx95 = len(windowLatencies) - 1 }
				if idx99 >= len(windowLatencies) { idx99 = len(windowLatencies) - 1 }
				
				p50ms = windowLatencies[idx50].Milliseconds()
				p90ms = windowLatencies[idx90].Milliseconds()
				p95ms = windowLatencies[idx95].Milliseconds()
				p99ms = windowLatencies[idx99].Milliseconds()
			}
			
			var avgTtfbMs int64
			if len(windowTTFB) > 0 {
				var totalTtfb time.Duration
				for _, t := range windowTTFB {
					totalTtfb += t
				}
				avgTtfbMs = (totalTtfb / time.Duration(len(windowTTFB))).Milliseconds()
			}

			// Publish window RPS atomically so broadcastLoop can read it
			windowRPS := int64(len(windowLatencies))
			ma.atomicRPS.Store(windowRPS)
			ma.atomicTotal.Store(totalRequestsMade)
			ma.atomicFailures.Store(totalHTTPFailures)
			ma.atomicP50ms.Store(p50ms)
			ma.atomicP90ms.Store(p90ms)
			ma.atomicP95ms.Store(p95ms)
			ma.atomicP99ms.Store(p99ms)
			ma.atomicTTFB.Store(avgTtfbMs)

			// Reset window
			windowLatencies = windowLatencies[:0]
			windowTTFB = windowTTFB[:0]
		}
	}
}

// broadcastLoop fires every second on its own dedicated ticker, reads the
// latest atomic counters, builds topology, and broadcasts to the WS hub.
// It is completely independent of statsChan so it can never be starved.
func (ma *MetricsAggregator) broadcastLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			rps := ma.atomicRPS.Load()
			total := ma.atomicTotal.Load()
			failures := ma.atomicFailures.Load()
			p50ms := ma.atomicP50ms.Load()
			p90ms := ma.atomicP90ms.Load()
			p95ms := ma.atomicP95ms.Load()
			p99ms := ma.atomicP99ms.Load()
			ttfb := ma.atomicTTFB.Load()
			
			activeConns := 0
			if ma.engine != nil {
				activeConns = ma.engine.ActiveConnections()
			}
			
			// ── Build topology snapshot ─────────────────────────────────
			rpsFlow := float64(rps)
			if rpsFlow < 1 {
				rpsFlow = 0.1
			}

			// Calc node value dynamically based on throughput
			agentVal := 5.0
			if rps > 0 {
				agentVal = math.Sqrt(float64(rps)) / 2.0
				if agentVal < 5.0 {
					agentVal = 5.0
				}
			}

			// Compute Health and Stats
			agentStatus := "healthy"
			if rps > 1000 {
				agentStatus = "degraded"
			}
			if failures > 0 && rps < 10 {
				agentStatus = "failing" // Just a dummy rule
			}

			// Ingestion Chan & Redis Stream (Mock Queue Depth based on latencies)
			queueDepth := int(rps) * 2
			if p95ms > 100 {
				queueDepth += int(p95ms)
			}
			queueStatus := "healthy"
			if queueDepth > 500 {
				queueStatus = "degraded"
			}
			if queueDepth > 2000 {
				queueStatus = "failing"
			}

			// Egress statuses
			wsStatus := "healthy"
			if p95ms > 500 {
				wsStatus = "degraded"
			}
			if p95ms > 1500 {
				wsStatus = "failing"
			}

			webhookStatus := "healthy"
			if failures > 0 {
				webhookStatus = "failing"
			} else if failures == 0 && p95ms > 800 {
				webhookStatus = "degraded"
			}

			// Set specific colors based on status (Supabase Theme)
			colorHealthy := "#3ecf8e"
			colorDegraded := "#ffdb13"
			colorFailing := "#ff2201"

			statusToColor := func(status string, defaultColor string) string {
				if status == "healthy" {
					return colorHealthy
				}
				if status == "degraded" {
					return colorDegraded
				}
				if status == "failing" {
					return colorFailing
				}
				return defaultColor
			}

			topo := &TopologyData{
				Nodes: []TopologyNode{
					{ID: "agent-pool", Name: "Agent Pool", Group: "agents", Val: agentVal, Color: statusToColor(agentStatus, "#3ecf8e"), Stat: fmt.Sprintf("%d rps", rps), Status: agentStatus},
					{ID: "ingestion-chan", Name: "Ingestion Chan", Group: "queue", Val: 10, Color: statusToColor(queueStatus, "#ffdb13"), Stat: fmt.Sprintf("%d queued", queueDepth), Status: queueStatus},
					{ID: "redis-stream", Name: "Redis Stream", Group: "queue", Val: 15, Color: statusToColor(queueStatus, "#ffdb13"), Stat: fmt.Sprintf("%d backlog", queueDepth/2), Status: queueStatus},
					{ID: "ws-hub", Name: "WebSocket Hub", Group: "egress", Val: 10, Color: statusToColor(wsStatus, "#3ecf8e"), Stat: fmt.Sprintf("%d conns", activeConns), Status: wsStatus},
					{ID: "webhook-workers", Name: "Webhook Workers", Group: "egress", Val: 10, Color: statusToColor(webhookStatus, "#3ecf8e"), Stat: fmt.Sprintf("%d errors", failures), Status: webhookStatus},
				},
				Links: []TopologyLink{
					{Source: "agent-pool", Target: "ingestion-chan", Throughput: rpsFlow, Particles: 4, Color: statusToColor(queueStatus, "")},
					{Source: "ingestion-chan", Target: "redis-stream", Throughput: rpsFlow * 0.9, Particles: 3, Color: statusToColor(queueStatus, "")},
					{Source: "redis-stream", Target: "ws-hub", Throughput: rpsFlow * 0.8, Particles: 3, Color: statusToColor(wsStatus, "")},
					{Source: "agent-pool", Target: "webhook-workers", Throughput: rpsFlow, Particles: 4, Color: statusToColor(webhookStatus, "")},
					{Source: "webhook-workers", Target: "ingestion-chan", Throughput: rpsFlow * 0.3, Particles: 2, Color: statusToColor(queueStatus, "")},
				},
			}

			payload := MetricsPayload{
				TotalRequestsMade: int(total),
				CurrentRPS:        int(rps),
				HTTPFailures:      int(failures),
				P50ResponseTime:   int(p50ms),
				P90ResponseTime:   int(p90ms),
				P95ResponseTime:   int(p95ms),
				P99ResponseTime:   int(p99ms),
				AvgTTFB:           int(ttfb),
				ActiveConnections: activeConns,
				Topology:          topo,
			}

			data, err := json.Marshal(payload)
			if err == nil {
				ma.broadcast(data)
			}
		}
	}
}
