package engine

import (
	"context"
	"sync"

	"geomock/internal/graph"
	"geomock/internal/queue"
)

type SimulationEngine struct {
	mu            sync.RWMutex
	agents        map[string]*DriverAgent
	telemetryChan chan<- queue.Telemetry
	cancelFunc    context.CancelFunc
	Graph         *graph.Graph
}

func NewSimulationEngine(telemetryChan chan<- queue.Telemetry) *SimulationEngine {
	return &SimulationEngine{
		agents:        make(map[string]*DriverAgent),
		telemetryChan: telemetryChan,
	}
}

func (e *SimulationEngine) AddAgent(agent *DriverAgent) {
	e.mu.Lock()
	defer e.mu.Unlock()
	agent.TelemetryChan = e.telemetryChan
	agent.Graph = e.Graph
	e.agents[agent.ID] = agent
}

func (e *SimulationEngine) SetAgents(agents []*DriverAgent) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.agents = make(map[string]*DriverAgent)
	for _, agent := range agents {
		agent.TelemetryChan = e.telemetryChan
		agent.Graph = e.Graph
		e.agents[agent.ID] = agent
	}
}

func (e *SimulationEngine) SetGraph(g *graph.Graph) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.Graph = g
	for _, agent := range e.agents {
		agent.Graph = g
	}
}

func (e *SimulationEngine) Start(parentCtx context.Context) {
	e.mu.Lock()

	// Cancel the previous goroutine pool, if any.
	if e.cancelFunc != nil {
		e.cancelFunc()
	}

	// Create a new derived context for this simulation run.
	ctx, cancel := context.WithCancel(parentCtx)
	e.cancelFunc = cancel

	// Snapshot the agents map under the lock, then release it before
	// spawning goroutines. Holding the lock across 1000 go statements
	// would block concurrent AddAgent/SetAgents calls from the HTTP handler.
	agents := make([]*DriverAgent, 0, len(e.agents))
	for _, agent := range e.agents {
		agents = append(agents, agent)
	}
	e.mu.Unlock() // Release lock BEFORE launching goroutines

	for _, agent := range agents {
		go agent.Run(ctx)
	}
}
