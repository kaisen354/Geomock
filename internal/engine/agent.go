package engine

import (
	"context"
	"math"
	"time"
)

type Coordinate struct {
	Lat float64
	Lng float64
}

type DriverAgent struct {
	ID                   string
	Lat                  float64
	Lng                  float64
	Speed                float64 // distance per tick
	CurrentWaypointIndex int
	Route                []Coordinate
}

// move performs a fast, lightweight linear step towards the target
func (a *DriverAgent) move(target Coordinate) bool {
	dx := target.Lng - a.Lng
	dy := target.Lat - a.Lat
	
	distSq := dx*dx + dy*dy
	if distSq <= a.Speed*a.Speed {
		// Reached or overshot the target
		a.Lat = target.Lat
		a.Lng = target.Lng
		return true // reached
	}
	
	dist := math.Sqrt(distSq)
	ratio := a.Speed / dist
	
	a.Lat += dy * ratio
	a.Lng += dx * ratio
	
	return false // not reached yet
}

func (a *DriverAgent) Run(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// Context canceled, terminate cleanly
			return
		case <-ticker.C:
			if a.CurrentWaypointIndex >= len(a.Route) {
				// Finished route
				return
			}
			
			target := a.Route[a.CurrentWaypointIndex]
			reached := a.move(target)
			
			if reached {
				a.CurrentWaypointIndex++
			}
		}
	}
}
