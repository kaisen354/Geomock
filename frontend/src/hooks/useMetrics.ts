import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = 'ws://localhost:8080/ws/metrics';
const INITIAL_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 32_000;
const JITTER_FACTOR = 0.1;

export interface MetricsPayload {
  totalRequestsMade: number;
  currentRps: number;
  httpFailures: number;
  p95ResponseTime: number; // in ms
  time?: string;
}

export interface MetricsHandle {
  metrics: MetricsPayload;
  history: MetricsPayload[];
}

export function useMetrics(): MetricsHandle {
  const [metrics, setMetrics] = useState<MetricsPayload>({
    totalRequestsMade: 0,
    currentRps: 0,
    httpFailures: 0,
    p95ResponseTime: 0,
  });
  const [history, setHistory] = useState<MetricsPayload[]>([]);

  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        backoffRef.current = INITIAL_BACKOFF_MS; // reset backoff on success
        console.log('[GeoMock] Metrics WebSocket connected');
      };

      ws.onmessage = (evt: MessageEvent) => {
        if (!mountedRef.current) return;

        try {
          const payload = JSON.parse(evt.data) as MetricsPayload;
          payload.time = new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' });
          setMetrics(payload);
          setHistory(prev => {
            const next = [...prev, payload];
            if (next.length > 60) next.shift(); // Keep last 60 seconds
            return next;
          });
        } catch {
          return; // malformed frame
        }
      };

      ws.onerror = () => {
        // onerror always precedes onclose; handled there
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;

        // Exponential backoff with ±JITTER_FACTOR jitter
        const jitter = 1 + (Math.random() * 2 - 1) * JITTER_FACTOR;
        const delay = Math.min(backoffRef.current * jitter, MAX_BACKOFF_MS);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);

        console.warn(`[GeoMock] Metrics WS closed — reconnecting in ${Math.round(delay)}ms`);
        retryTimerRef.current = setTimeout(connect, delay);
      };
    } catch (err) {
      console.error('[GeoMock] Failed to construct Metrics WebSocket:', err);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [connect]);

  return { metrics, history };
}
