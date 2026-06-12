package graph

import "container/heap"

// pqItem represents a single entry in the A* open set.
// coord is the graph node; fScore is G + H (lower is better).
type pqItem struct {
	coord  Coordinate
	fScore float64
	index  int // maintained by the heap for O(log n) updates
}

// priorityQueue implements heap.Interface as a min-heap on fScore.
// Allocate a new instance per FindShortestPath call — never share across goroutines.
type priorityQueue []*pqItem

func (pq priorityQueue) Len() int { return len(pq) }

func (pq priorityQueue) Less(i, j int) bool {
	return pq[i].fScore < pq[j].fScore
}

func (pq priorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}

// Push appends a new item to the heap (called by container/heap).
func (pq *priorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*pqItem)
	item.index = n
	*pq = append(*pq, item)
}

// Pop removes and returns the minimum fScore item (called by container/heap).
func (pq *priorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil  // prevent memory leak
	item.index = -1 // mark as removed
	*pq = old[:n-1]
	return item
}

// push is a convenience wrapper that handles heap.Push bookkeeping.
func (pq *priorityQueue) push(coord Coordinate, fScore float64) {
	heap.Push(pq, &pqItem{coord: coord, fScore: fScore})
}

// pop returns the coord with the lowest fScore and removes it from the heap.
func (pq *priorityQueue) pop() *pqItem {
	return heap.Pop(pq).(*pqItem)
}
