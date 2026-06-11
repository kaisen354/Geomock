package graph

import (
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

// roundCoord rounds a coordinate to 5 decimal places (approx 1.1 meter accuracy)
// This naturally merges intersecting road segments into shared nodes.
func roundCoord(lat, lng float64) Coordinate {
	return Coordinate{
		Lat: math.Round(lat*100000) / 100000,
		Lng: math.Round(lng*100000) / 100000,
	}
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
