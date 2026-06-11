package api

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for the simulation dashboard
	},
}

type Client struct {
	conn *websocket.Conn
	send chan []byte
}

type WebSocketHub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex
}

func NewWebSocketHub() *WebSocketHub {
	return &WebSocketHub{
		broadcast:  make(chan []byte, 256), // sized for 1000-agent batches
		register:   make(chan *Client, 64), // buffered so ServeWS never blocks
		unregister: make(chan *Client, 64), // buffered so write-pump never blocks
		clients:    make(map[*Client]bool),
	}
}

func (h *WebSocketHub) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			// Clean shutdown
			h.mu.Lock()
			for client := range h.clients {
				client.conn.Close()
				delete(h.clients, client)
			}
			h.mu.Unlock()
			return
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					// Head-of-line blocking prevention: Forcefully disconnect slow clients
					close(client.send)
					delete(h.clients, client)
					client.conn.Close()
				}
			}
			h.mu.Unlock()
		}
	}
}

func (h *WebSocketHub) Broadcast(payload []byte) {
	select {
	case h.broadcast <- payload:
	default:
		log.Println("warning: WebSocket broadcast channel full, dropping frame")
	}
}

func (h *WebSocketHub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade websocket: %v", err)
		return
	}
	
	client := &Client{
		conn: conn,
		send: make(chan []byte, 256), // Buffer sized for full telemetry frames
	}

	// Non-blocking register: if hub event loop is temporarily busy,
	// log and abort instead of blocking the HTTP handler goroutine.
	select {
	case h.register <- client:
	default:
		log.Println("warning: WebSocket hub register channel full, dropping new connection")
		conn.Close()
		return
	}

	// Pump messages from hub to websocket connection
	go func() {
		defer func() {
			// Non-blocking unregister: write-pump must never deadlock waiting
			// for the hub event loop to drain its own broadcast queue.
			select {
			case h.unregister <- client:
			default:
				log.Println("warning: WebSocket hub unregister channel full, forcing close")
				client.conn.Close()
			}
		}()
		
		for {
			message, ok := <-client.send
			if !ok {
				// Hub closed the channel
				client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			
			client.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := client.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		}
	}()
}
