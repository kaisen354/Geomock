package main

import (
	"context"
	"fmt"
	"runtime"
	"strconv"
	"time"

	"geomock/internal/engine"
)

func main() {
	fmt.Println("Initializing Core Simulation Engine...")
	
	simEngine := engine.NewSimulationEngine()
	
	// Create mock pool of 1,000 agents
	for i := 0; i < 1000; i++ {
		id := "agent_" + strconv.Itoa(i)
		
		agent := &engine.DriverAgent{
			ID:                   id,
			Lat:                  37.7749 + float64(i)*0.0001,
			Lng:                  -122.4194 + float64(i)*0.0001,
			Speed:                0.001, // Movement per tick
			CurrentWaypointIndex: 0,
			Route: []engine.Coordinate{
				{Lat: 37.8000, Lng: -122.4000},
				{Lat: 37.9000, Lng: -122.3000},
			},
		}
		
		simEngine.AddAgent(agent)
	}
	
	fmt.Println("Generated 1000 agents.")
	
	// Setup context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	
	fmt.Println("Starting engine...")
	simEngine.Start(ctx)
	
	// Monitor memory consumption and execution stability
	for i := 0; i < 5; i++ {
		time.Sleep(2 * time.Second)
		printMemStats()
	}
	
	fmt.Println("Shutting down engine...")
	cancel()
	
	// Wait briefly to allow goroutines to clean up
	time.Sleep(1 * time.Second)
	printMemStats()
	
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
