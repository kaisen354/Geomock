package engine

import (
	"context"
	"sync"
)

type SimulationEngine struct {
	mu     sync.RWMutex
	agents map[string]*DriverAgent
}

func NewSimulationEngine() *SimulationEngine {
	return &SimulationEngine{
		agents: make(map[string]*DriverAgent),
	}
}

func (e *SimulationEngine) AddAgent(agent *DriverAgent) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.agents[agent.ID] = agent
}

func (e *SimulationEngine) Start(ctx context.Context) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	
	for _, agent := range e.agents {
		go agent.Run(ctx)
	}
}
