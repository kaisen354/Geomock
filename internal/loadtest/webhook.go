package loadtest

import (
	"bytes"
	"context"
	"log"
	"net/http"
	"time"
)

// WebhookForwarder manages sending batch telemetry to an external HTTP URL
type WebhookForwarder struct {
	TargetURL string
	client    *http.Client
	PayloadCh chan []byte
	StatsChan chan RequestStat
}

type RequestStat struct {
	Code    int
	Latency time.Duration
}

func NewWebhookForwarder(targetURL string) *WebhookForwarder {
	// Custom transport for high concurrency and connection reuse
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.MaxIdleConns = 1000
	t.MaxConnsPerHost = 1000
	t.MaxIdleConnsPerHost = 1000

	return &WebhookForwarder{
		TargetURL: targetURL,
		client: &http.Client{
			Transport: t,
			Timeout:   5 * time.Second,
		},
		// Buffer payloads so simulation loop is never blocked
		PayloadCh: make(chan []byte, 100),
		StatsChan: make(chan RequestStat, 1000),
	}
}

// Start begins background worker goroutines
func (wf *WebhookForwarder) Start(ctx context.Context) {
	// Worker pool for concurrent HTTP requests
	for i := 0; i < 10; i++ {
		go wf.worker(ctx)
	}

	// Reporter has been removed in favor of MetricsAggregator
}

func (wf *WebhookForwarder) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case data := <-wf.PayloadCh:
			wf.sendPayload(ctx, data)
		}
	}
}

func (wf *WebhookForwarder) sendPayload(ctx context.Context, data []byte) {
	start := time.Now()

	req, err := http.NewRequestWithContext(ctx, "POST", wf.TargetURL, bytes.NewReader(data))
	if err != nil {
		log.Printf("[Webhook] Request build error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := wf.client.Do(req)
	latency := time.Since(start)

	if err != nil {
		log.Printf("[Webhook] POST failed: %v", err)
		wf.StatsChan <- RequestStat{Code: 0, Latency: latency} // Represent error with 0
		return
	}
	defer resp.Body.Close()

	// Track status codes & latency
	wf.StatsChan <- RequestStat{Code: resp.StatusCode, Latency: latency}
}

func (wf *WebhookForwarder) reporter(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	type statInfo struct {
		Count      int
		TotalLat   time.Duration
	}
	statusCounts := make(map[int]*statInfo)

	for {
		select {
		case <-ctx.Done():
			return
		case s := <-wf.StatsChan:
			if statusCounts[s.Code] == nil {
				statusCounts[s.Code] = &statInfo{}
			}
			statusCounts[s.Code].Count++
			statusCounts[s.Code].TotalLat += s.Latency
		case <-ticker.C:
			totalReq := 0
			for _, v := range statusCounts {
				totalReq += v.Count
			}
			if totalReq > 0 {
				log.Printf("[Webhook Stats] Target: %s | Reqs/5s: %d", wf.TargetURL, totalReq)
				for code, st := range statusCounts {
					avgLat := st.TotalLat / time.Duration(st.Count)
					log.Printf("  -> Status %d: %d reqs (avg latency: %v)", code, st.Count, avgLat)
				}
				// Reset stats for next interval
				statusCounts = make(map[int]*statInfo)
			}
		}
	}
}
