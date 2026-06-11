package queue

type Telemetry struct {
	AgentID string  `json:"id"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	Bearing float64 `json:"bearing"` // Degrees clockwise from north (0–360)
}
