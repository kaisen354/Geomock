package graph

import (
	"container/heap"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"sync"
)

type Coordinate struct {
	Lat float64
	Lng float64
}

type Node struct {
	Coord     Coordinate
	Neighbors []Coordinate
}

type Graph struct {
	mu    sync.RWMutex
	Nodes map[Coordinate]*Node
	Keys  []Coordinate
}

func NewGraph() *Graph {
	return &Graph{
		Nodes: make(map[Coordinate]*Node),
	}
}

// Mu returns a pointer to the graph's RWMutex so external packages can
// acquire read or write locks without the field being exported.
func (g *Graph) Mu() *sync.RWMutex {
	return &g.mu
}

// roundCoord rounds a coordinate to 5 decimal places (approx 1.1 meter accuracy)
// This naturally merges intersecting road segments into shared nodes.
func roundCoord(lat, lng float64) Coordinate {
	return Coordinate{
		Lat: math.Round(lat*100000) / 100000,
		Lng: math.Round(lng*100000) / 100000,
	}
}

// HaversineDistance returns the great-circle distance in kilometres between
// two points on Earth given their latitude/longitude in decimal degrees.
// It is a pure function with no locks; safe to call from any goroutine.
func HaversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0 // Earth's mean radius in km
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

func (g *Graph) addEdge(c1, c2 Coordinate) {
	if c1 == c2 {
		return
	}
	
	if g.Nodes[c1] == nil {
		g.Nodes[c1] = &Node{Coord: c1}
		g.Keys = append(g.Keys, c1)
	}
	if g.Nodes[c2] == nil {
		g.Nodes[c2] = &Node{Coord: c2}
		g.Keys = append(g.Keys, c2)
	}

	// Avoid duplicate neighbors
	c1Node := g.Nodes[c1]
	found := false
	for _, n := range c1Node.Neighbors {
		if n == c2 {
			found = true
			break
		}
	}
	if !found {
		c1Node.Neighbors = append(c1Node.Neighbors, c2)
	}

	c2Node := g.Nodes[c2]
	found = false
	for _, n := range c2Node.Neighbors {
		if n == c1 {
			found = true
			break
		}
	}
	if !found {
		c2Node.Neighbors = append(c2Node.Neighbors, c1)
	}
}

// ParseGeoJSON traverses a GeoJSON and extracts LineStrings into a routing graph
func ParseGeoJSON(data []byte) (*Graph, error) {
	var geoJSON map[string]interface{}
	if err := json.Unmarshal(data, &geoJSON); err != nil {
		return nil, err
	}

	g := NewGraph()

	var walk func(v interface{})
	walk = func(v interface{}) {
		switch node := v.(type) {
		case map[string]interface{}:
			geomType, ok := node["type"].(string)
			if ok && geomType == "LineString" {
				if coords, ok := node["coordinates"].([]interface{}); ok {
					var lastCoord *Coordinate
					for _, point := range coords {
						pt, ok := point.([]interface{})
						if ok && len(pt) >= 2 {
							lng, ok1 := pt[0].(float64)
							lat, ok2 := pt[1].(float64)
							if ok1 && ok2 {
								curr := roundCoord(lat, lng)
								if lastCoord != nil {
									g.addEdge(*lastCoord, curr)
								}
								lastCoord = &curr
							}
						}
					}
				}
			} else if ok && geomType == "MultiLineString" {
				if lines, ok := node["coordinates"].([]interface{}); ok {
					for _, line := range lines {
						if coords, ok := line.([]interface{}); ok {
							var lastCoord *Coordinate
							for _, point := range coords {
								pt, ok := point.([]interface{})
								if ok && len(pt) >= 2 {
									lng, ok1 := pt[0].(float64)
									lat, ok2 := pt[1].(float64)
									if ok1 && ok2 {
										curr := roundCoord(lat, lng)
										if lastCoord != nil {
											g.addEdge(*lastCoord, curr)
										}
										lastCoord = &curr
									}
								}
							}
						}
					}
				}
			} else {
				for _, val := range node {
					walk(val)
				}
			}
		case []interface{}:
			for _, item := range node {
				walk(item)
			}
		}
	}

	walk(geoJSON)

	if len(g.Nodes) == 0 {
		return nil, fmt.Errorf("no valid LineString coordinates found in GeoJSON to build routing graph")
	}

	return g, nil
}

// GetRandomNode returns a random node from the graph.
func (g *Graph) GetRandomNode() (Coordinate, bool) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	
	if len(g.Keys) == 0 {
		return Coordinate{}, false
	}
	return g.Keys[rand.Intn(len(g.Keys))], true
}

// GetRandomNeighbor returns a connected neighbor for a given coordinate.
// If the coordinate isn't in the graph or has no neighbors, it returns false.
func (g *Graph) GetRandomNeighbor(lat, lng float64) (Coordinate, bool) {
	rc := roundCoord(lat, lng)
	
	g.mu.RLock()
	defer g.mu.RUnlock()
	
	node, exists := g.Nodes[rc]
	if !exists || len(node.Neighbors) == 0 {
		return Coordinate{}, false
	}
	
	return node.Neighbors[rand.Intn(len(node.Neighbors))], true
}

// FindShortestPath computes the shortest path from start to target using the
// A* algorithm with a Haversine heuristic.
//
// Contract: both start and target MUST be coordinates that exist as keys in
// g.Nodes (i.e. they were produced by roundCoord or retrieved from g.Keys).
// Use findClosestNode in main.go to guarantee this.
//
// Returns:
//   - ([]Coordinate, nil)  — ordered path from start to target (inclusive).
//   - (nil, nil)           — start == target, no movement needed.
//   - (nil, error)         — no path found (disconnected graph).
//
// This method acquires a read lock so multiple goroutines may search
// concurrently without blocking each other or graph mutations.
func (g *Graph) FindShortestPath(start, target Coordinate) ([]Coordinate, error) {
	if start == target {
		return nil, nil
	}

	g.mu.RLock()
	defer g.mu.RUnlock()

	// Verify both endpoints exist in the graph.
	if _, ok := g.Nodes[start]; !ok {
		return nil, fmt.Errorf("start node %.5f,%.5f not found in graph", start.Lat, start.Lng)
	}
	if _, ok := g.Nodes[target]; !ok {
		return nil, fmt.Errorf("target node %.5f,%.5f not found in graph", target.Lat, target.Lng)
	}

	// gScore[n] = best known actual distance (km) from start to n.
	gScore := make(map[Coordinate]float64)
	gScore[start] = 0

	// cameFrom[n] = the node immediately preceding n on the cheapest path so far.
	cameFrom := make(map[Coordinate]Coordinate)

	// Open set: min-heap ordered by fScore = gScore + heuristic.
	pq := &priorityQueue{}
	heap.Init(pq)
	h := HaversineDistance(start.Lat, start.Lng, target.Lat, target.Lng)
	pq.push(start, h)

	for pq.Len() > 0 {
		current := pq.pop().coord

		if current == target {
			return reconstructPath(cameFrom, current), nil
		}

		currentNode, ok := g.Nodes[current]
		if !ok {
			continue
		}

		for _, neighborCoord := range currentNode.Neighbors {
			// Edge weight: real-world km between the two nodes.
			edgeWeight := HaversineDistance(
				current.Lat, current.Lng,
				neighborCoord.Lat, neighborCoord.Lng,
			)
			tentativeG := gScore[current] + edgeWeight

			if best, seen := gScore[neighborCoord]; !seen || tentativeG < best {
				gScore[neighborCoord] = tentativeG
				cameFrom[neighborCoord] = current
				hNeighbor := HaversineDistance(
					neighborCoord.Lat, neighborCoord.Lng,
					target.Lat, target.Lng,
				)
				pq.push(neighborCoord, tentativeG+hNeighbor)
			}
		}
	}

	return nil, fmt.Errorf("no path found from %.5f,%.5f to %.5f,%.5f",
		start.Lat, start.Lng, target.Lat, target.Lng)
}

// reconstructPath walks cameFrom backwards from current to the start
// and returns the path in start→target order.
func reconstructPath(cameFrom map[Coordinate]Coordinate, current Coordinate) []Coordinate {
	path := []Coordinate{current}
	for {
		prev, ok := cameFrom[current]
		if !ok {
			break
		}
		path = append([]Coordinate{prev}, path...)
		current = prev
	}
	return path
}
