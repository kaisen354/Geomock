import { useEffect, useRef, useCallback } from 'react';
import type { TelemetryPoint, StatsSnapshot } from '../types';

const WS_URL = 'ws://localhost:8080/ws/live';
const INITIAL_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 32_000;
const JITTER_FACTOR = 0.1;

export interface TelemetryHandle {
  agentsRef: React.MutableRefObject<Map<string, TelemetryPoint>>;
  statsRef: React.MutableRefObject<StatsSnapshot>;
}

export function useTelemetry(): TelemetryHandle {
  const agentsRef = useRef<Map<string, TelemetryPoint>>(new Map());
  const statsRef = useRef<StatsSnapshot>({ msgPerSec: 0, anomalies: 0, recentAnomalies: [], connected: false });

  // Rolling message counter for throughput calculation
  const msgCountRef = useRef(0);
  const lastFlushRef = useRef(Date.now());

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
        statsRef.current = { ...statsRef.current, connected: true };
        console.log('[GeoMock] WebSocket connected');
      };

      ws.onmessage = (evt: MessageEvent) => {
        if (!mountedRef.current) return;

        let batch: TelemetryPoint[];
        try {
          batch = JSON.parse(evt.data as string) as TelemetryPoint[];
        } catch {
          return; // malformed frame — drop silently
        }

        if (!Array.isArray(batch)) return;

        // Write directly into the ref Map — zero React re-renders
        for (const pt of batch) {
          // Capture previous snapshot BEFORE overwriting (bearing delta anomaly detection)
          const prev = agentsRef.current.get(pt.id);
          agentsRef.current.set(pt.id, pt);

          // Simple anomaly heuristic: bearing change > 90° between ticks
          if (prev && Math.abs(prev.bearing - pt.bearing) > 90) {
            statsRef.current.anomalies += 1;
            statsRef.current.recentAnomalies.unshift({
              id: pt.id,
              type: "Gridlock",
              lat: pt.lat,
              lng: pt.lng,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            });
            if (statsRef.current.recentAnomalies.length > 50) {
              statsRef.current.recentAnomalies.pop();
            }
          }
        }

        // Throughput accounting
        msgCountRef.current += batch.length;
        const now = Date.now();
        const elapsed = now - lastFlushRef.current;
        if (elapsed >= 1000) {
          statsRef.current = {
            ...statsRef.current,
            msgPerSec: Math.round(msgCountRef.current * (1000 / elapsed)),
          };
          msgCountRef.current = 0;
          lastFlushRef.current = now;
        }
      };

      ws.onerror = () => {
        // onerror always precedes onclose; handled there
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        statsRef.current = { ...statsRef.current, connected: false };

        // Exponential backoff with ±JITTER_FACTOR jitter
        const jitter = 1 + (Math.random() * 2 - 1) * JITTER_FACTOR;
        const delay = Math.min(backoffRef.current * jitter, MAX_BACKOFF_MS);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);

        console.warn(`[GeoMock] WS closed — reconnecting in ${Math.round(delay)}ms`);
        retryTimerRef.current = setTimeout(connect, delay);
      };
    } catch (err) {
      console.error('[GeoMock] Failed to construct WebSocket:', err);
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

  return { agentsRef, statsRef };
}
