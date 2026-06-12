package engine

import (
	"context"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"

	"geomock/internal/graph"
	"geomock/internal/queue"
)

type Coordinate struct {
	Lat float64
	Lng float64
}

type DriverAgent struct {
	mu                   sync.Mutex
	ID                   string
	Lat                  float64
	Lng                  float64
	Speed                float64 // distance per tick
	CurrentWaypointIndex int
	Route                []Coordinate
	TelemetryChan        chan<- queue.Telemetry
	bearing              float64 // last computed bearing in degrees
	TickRate             int     // Milliseconds per tick
	Graph                *graph.Graph

	// ── A* routing fields (Phase 5) ──────────────────────────────
	TargetDestination *graph.Coordinate  // nullable; the A* goal node
	CurrentRoute      []graph.Coordinate // ordered waypoints returned by FindShortestPath
	RouteIndex        int                // next waypoint index in CurrentRoute
}

func (a *DriverAgent) Run(ctx context.Context) {
	if a.TickRate <= 0 {
		a.TickRate = 1000 // default to 1 second
	}
	ticker := time.NewTicker(time.Duration(a.TickRate) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// Context canceled, terminate cleanly
			return
		case <-ticker.C:
			a.mu.Lock()
			
			remainingSpeed := a.Speed
			
			for remainingSpeed > 0 {
				// ── Priority 1: Follow A* route ───────────────────────────────
				if len(a.CurrentRoute) > 0 && a.RouteIndex < len(a.CurrentRoute) {
					waypoint := a.CurrentRoute[a.RouteIndex]
					target := Coordinate{Lat: waypoint.Lat, Lng: waypoint.Lng}
					dx := target.Lng - a.Lng
					dy := target.Lat - a.Lat
					distSq := dx*dx + dy*dy

					if distSq <= remainingSpeed*remainingSpeed {
						// Reached this waypoint
						dist := math.Sqrt(distSq)
						a.Lat = target.Lat
						a.Lng = target.Lng
						remainingSpeed -= dist
						a.RouteIndex++

						if dist > 0 {
							bearingRad := math.Atan2(dx, dy)
							bearingDeg := bearingRad * 180 / math.Pi
							if bearingDeg < 0 {
								bearingDeg += 360
							}
							a.bearing = bearingDeg
						}
						if dist == 0 {
							remainingSpeed -= a.Speed * 0.1
						}

						// Exhausted the A* route → clear and fall through to idle wander
						if a.RouteIndex >= len(a.CurrentRoute) {
							a.CurrentRoute = nil
							a.RouteIndex = 0
							a.TargetDestination = nil
						}
					} else {
						// Move partially toward waypoint
						dist := math.Sqrt(distSq)
						ratio := remainingSpeed / dist
						a.Lat += dy * ratio
						a.Lng += dx * ratio
						remainingSpeed = 0

						bearingRad := math.Atan2(dx, dy)
						bearingDeg := bearingRad * 180 / math.Pi
						if bearingDeg < 0 {
							bearingDeg += 360
						}
						a.bearing = bearingDeg
					}
					continue
				}

				// ── Priority 2: Idle wander (original GetRandomNeighbor logic) ─
				if a.CurrentWaypointIndex >= len(a.Route) {
					// Finished route, pick next node using Graph if available
					if a.Graph != nil {
						if nextPt, ok := a.Graph.GetRandomNeighbor(a.Lat, a.Lng); ok {
							a.Route = append(a.Route, Coordinate{Lat: nextPt.Lat, Lng: nextPt.Lng})
						} else {
							// Fallback if node disconnected or missing: teleport to a new valid node
							if randNode, ok := a.Graph.GetRandomNode(); ok {
								a.Route = append(a.Route, Coordinate{Lat: randNode.Lat, Lng: randNode.Lng})
							} else {
								// Failsafe
								a.Route = append(a.Route, Coordinate{
									Lat: a.Lat + (rand.Float64()-0.5)*0.02,
									Lng: a.Lng + (rand.Float64()-0.5)*0.02,
								})
							}
						}
					} else {
						a.Route = append(a.Route, Coordinate{
							Lat: a.Lat + (rand.Float64()-0.5)*0.02,
							Lng: a.Lng + (rand.Float64()-0.5)*0.02,
						})
					}
				}

				target := a.Route[a.CurrentWaypointIndex]
				dx := target.Lng - a.Lng
				dy := target.Lat - a.Lat
				distSq := dx*dx + dy*dy

				if distSq <= remainingSpeed*remainingSpeed {
					// Reached target within this tick's remaining speed
					dist := math.Sqrt(distSq)
					a.Lat = target.Lat
					a.Lng = target.Lng
					remainingSpeed -= dist
					a.CurrentWaypointIndex++

					// Update bearing if we actually moved
					if dist > 0 {
						bearingRad := math.Atan2(dx, dy)
						bearingDeg := bearingRad * 180 / math.Pi
						if bearingDeg < 0 {
							bearingDeg += 360
						}
						a.bearing = bearingDeg
					}
					
					// Failsafe to prevent infinite loops if coincident nodes are generated
					if dist == 0 {
						remainingSpeed -= a.Speed * 0.1 
					}
				} else {
					// Move partially towards target
					dist := math.Sqrt(distSq)
					ratio := remainingSpeed / dist
					a.Lat += dy * ratio
					a.Lng += dx * ratio
					remainingSpeed = 0 // Finished moving for this tick
					
					bearingRad := math.Atan2(dx, dy)
					bearingDeg := bearingRad * 180 / math.Pi
					if bearingDeg < 0 {
						bearingDeg += 360
					}
					a.bearing = bearingDeg
				}
			}
			
			payload := queue.Telemetry{
				AgentID: a.ID,
				Lat:     a.Lat,
				Lng:     a.Lng,
				Bearing: a.bearing,
			}
			a.mu.Unlock()

			// Emit telemetry with backpressure guardrail
			if a.TelemetryChan != nil {
				select {
				case a.TelemetryChan <- payload:
					// Sent successfully
				default:
					// Backpressure: drop frame and log warning
					log.Printf("warning: telemetry channel full, dropping frame for agent %s", a.ID)
				}
			}
		}
	}
}

// Lock acquires the agent's internal mutex. Use for external packages that
// need to atomically read or write agent state (e.g. the /api/chat handler).
func (a *DriverAgent) Lock() { a.mu.Lock() }

// Unlock releases the agent's internal mutex.
func (a *DriverAgent) Unlock() { a.mu.Unlock() }

// Rescatter safely repositions the agent and resets its routing
func (a *DriverAgent) Rescatter(lat, lng float64) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// If a graph is present, snap directly to a valid road node
	if a.Graph != nil {
		if node, ok := a.Graph.GetRandomNode(); ok {
			lat = node.Lat
			lng = node.Lng
		}
	}

	a.Lat = lat
	a.Lng = lng
	a.CurrentWaypointIndex = 0
	a.Route = []Coordinate{
		{Lat: lat, Lng: lng},
	}

	if a.Graph != nil {
		if next, ok := a.Graph.GetRandomNeighbor(lat, lng); ok {
			a.Route = append(a.Route, Coordinate{Lat: next.Lat, Lng: next.Lng})
		} else {
			a.Route = append(a.Route, Coordinate{Lat: lat + (rand.Float64()-0.5)*0.02, Lng: lng + (rand.Float64()-0.5)*0.02})
		}
	} else {
		a.Route = append(a.Route, Coordinate{Lat: lat + (rand.Float64()-0.5)*0.02, Lng: lng + (rand.Float64()-0.5)*0.02})
	}
}

