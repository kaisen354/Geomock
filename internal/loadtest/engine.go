package loadtest

import (
	"bytes"
	"context"
	"crypto/tls"
	"io"
	"net/http"
	"net/http/httptrace"
	"sync"
	"sync/atomic"
	"time"
)

// TestPattern defines how the load is applied
type TestPattern string

const (
	Spike     TestPattern = "spike"
	RampUp    TestPattern = "ramp-up"
	Soak      TestPattern = "soak"
	Breakpoint TestPattern = "breakpoint"
)

// LoadTestConfig represents the settings for a load test
type LoadTestConfig struct {
	URL         string            `json:"url"`
	Method      string            `json:"method"`
	Headers     map[string]string `json:"headers"`
	Body        string            `json:"body"`
	Agents      int               `json:"agents"`
	Pattern     TestPattern       `json:"pattern"`
	DurationSec int               `json:"durationSec"`
	RampSec     int               `json:"rampSec"`
}

// ExtendedRequestStat includes more detailed timing
type ExtendedRequestStat struct {
	Code         int
	Latency      time.Duration
	DNSLookup    time.Duration
	TCPConnect   time.Duration
	TLSHandshake time.Duration
	TTFB         time.Duration
}

// LoadTestEngine manages the load test execution
type LoadTestEngine struct {
	Config    LoadTestConfig
	StatsChan chan ExtendedRequestStat
	
	activeConnections atomic.Int32
	client            *http.Client
}

func NewLoadTestEngine(cfg LoadTestConfig) *LoadTestEngine {
	// Custom transport for high concurrency
	t := &http.Transport{
		MaxIdleConns:        cfg.Agents * 2,
		MaxConnsPerHost:     cfg.Agents * 2,
		MaxIdleConnsPerHost: cfg.Agents * 2,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true}, // for testing
	}

	return &LoadTestEngine{
		Config:    cfg,
		StatsChan: make(chan ExtendedRequestStat, 10000), // large buffer
		client: &http.Client{
			Transport: t,
			Timeout:   10 * time.Second,
		},
	}
}

func (e *LoadTestEngine) Start(ctx context.Context) {
	var wg sync.WaitGroup
	start := time.Now()
	
	for i := 0; i < e.Config.Agents; i++ {
		wg.Add(1)
		go func(agentID int) {
			defer wg.Done()
			
			// Pattern logic
			if e.Config.Pattern == RampUp && e.Config.RampSec > 0 {
				// stagger start based on agentID
				delay := time.Duration((float64(agentID)/float64(e.Config.Agents))*float64(e.Config.RampSec)) * time.Second
				select {
				case <-time.After(delay):
				case <-ctx.Done():
					return
				}
			}

			// Main worker loop
			for {
				select {
				case <-ctx.Done():
					return
				default:
					if e.Config.DurationSec > 0 && time.Since(start).Seconds() >= float64(e.Config.DurationSec) {
						return
					}
					e.doRequest(ctx)
				}
			}
		}(i)
	}

	// wait for completion and close stats channel?
	// usually the context handles cancellation.
}

func (e *LoadTestEngine) ActiveConnections() int {
	return int(e.activeConnections.Load())
}

func (e *LoadTestEngine) doRequest(ctx context.Context) {
	e.activeConnections.Add(1)
	defer e.activeConnections.Add(-1)

	var req *http.Request
	var err error

	if e.Config.Body != "" {
		req, err = http.NewRequestWithContext(ctx, e.Config.Method, e.Config.URL, bytes.NewBufferString(e.Config.Body))
	} else {
		req, err = http.NewRequestWithContext(ctx, e.Config.Method, e.Config.URL, nil)
	}

	if err != nil {
		e.StatsChan <- ExtendedRequestStat{Code: 0, Latency: 0}
		return
	}

	for k, v := range e.Config.Headers {
		req.Header.Set(k, v)
	}

	// Setup trace for detailed timings
	var dnsStart, tcpStart, tlsStart time.Time
	var dns, tcp, tlsH, firstByte time.Duration

	trace := &httptrace.ClientTrace{
		DNSStart: func(info httptrace.DNSStartInfo) { dnsStart = time.Now() },
		DNSDone:  func(info httptrace.DNSDoneInfo) { dns = time.Since(dnsStart) },
		ConnectStart: func(network, addr string) {
			if dns == 0 {
				tcpStart = time.Now()
			}
		},
		ConnectDone: func(network, addr string, err error) {
			if err == nil {
				tcp = time.Since(tcpStart)
			}
		},
		TLSHandshakeStart: func() { tlsStart = time.Now() },
		TLSHandshakeDone: func(cs tls.ConnectionState, err error) {
			if err == nil {
				tlsH = time.Since(tlsStart)
			}
		},
		GotFirstResponseByte: func() {
			firstByte = time.Since(dnsStart) // Approximation from start
			if dns == 0 {
				firstByte = time.Since(tcpStart) // fallback
			}
		},
	}

	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

	start := time.Now()
	resp, err := e.client.Do(req)
	latency := time.Since(start)

	if err != nil {
		e.StatsChan <- ExtendedRequestStat{
			Code:         0,
			Latency:      latency,
			DNSLookup:    dns,
			TCPConnect:   tcp,
			TLSHandshake: tlsH,
			TTFB:         firstByte,
		}
		return
	}

	// Need to consume body to reuse connection
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()

	if firstByte == 0 {
		firstByte = latency
	}

	e.StatsChan <- ExtendedRequestStat{
		Code:         resp.StatusCode,
		Latency:      latency,
		DNSLookup:    dns,
		TCPConnect:   tcp,
		TLSHandshake: tlsH,
		TTFB:         firstByte,
	}
}
