import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import type { LatLngBoundsExpression } from 'leaflet';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Props {
  onFlyTo: (bounds: LatLngBoundsExpression) => void;
}

type EntryKind = 'user' | 'ai' | 'system' | 'error';

interface LogEntry {
  id: string;
  kind: EntryKind;
  text: string;
}

interface BoundingEnvelope {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface ChatResponse {
  reply: string;
  bounds?: BoundingEnvelope;
}

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

// ─────────────────────────────────────────────────────────────
// Drag hook — keeps the floating panel draggable
// ─────────────────────────────────────────────────────────────

function useDrag(initialPos: { x: number; y: number }) {
  const [pos, setPos] = useState(initialPos);
  const dragging = useRef(false);
  const origin   = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: origin.current.px + (ev.clientX - origin.current.mx),
        y: origin.current.py + (ev.clientY - origin.current.my),
      });
    };

    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [pos]);

  return { pos, onMouseDown };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export const CopilotTerminal: React.FC<Props> = ({ onFlyTo }) => {
  // Initial position: bottom-right corner with margin
  const { pos, onMouseDown } = useDrag({
    x: window.innerWidth  - 440,
    y: window.innerHeight - 340,
  });

  const [minimized, setMinimized]   = useState(false);
  const [log, setLog]               = useState<LogEntry[]>([
    { id: 'boot', kind: 'system', text: 'OVERSEER v4.0 — ONLINE. Gemini AI control interface active.' },
    { id: 'hint', kind: 'system', text: 'Try: "deploy 500 agents to London" or "run a stress test with 2000 agents"' },
  ]);
  const [input, setInput]           = useState('');
  const [processing, setProcessing] = useState(false);

  const logEndRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const counterRef = useRef(0);

  // Auto-scroll to latest entry
  useEffect(() => {
    if (!minimized) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [log, minimized]);

  // Focus input when un-minimised
  useEffect(() => {
    if (!minimized) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [minimized]);

  const addEntry = useCallback((kind: EntryKind, text: string) => {
    const id = `entry-${++counterRef.current}`;
    setLog(prev => [...prev, { id, kind, text }]);
  }, []);

  // ── Send command ──────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || processing) return;

    setInput('');
    setProcessing(true);
    addEntry('user', text);
    addEntry('system', 'Processing▋');

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      // Remove the "Processing▋" placeholder
      setLog(prev => prev.filter(e => e.text !== 'Processing▋'));

      if (!res.ok) {
        const body = await res.text();
        addEntry('error', `Backend error ${res.status}: ${body}`);
        return;
      }

      const data = await res.json() as ChatResponse;

      if (data.reply) {
        addEntry('ai', data.reply.trim());
      } else {
        addEntry('ai', 'Command executed. Simulation updated.');
      }

      // Fly the map to the city if Overseer returned bounds
      if (data.bounds) {
        const { minLat, minLng, maxLat, maxLng } = data.bounds;
        onFlyTo([[minLat, minLng], [maxLat, maxLng]]);
      }
    } catch {
      setLog(prev => prev.filter(e => e.text !== 'Processing▋'));
      addEntry('error', 'Backend unreachable — is the Go server running?');
    } finally {
      setProcessing(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, processing, addEntry, onFlyTo]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') send();
  };

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div
      className={`copilot-terminal${minimized ? ' minimized' : ''}`}
      style={{
        left: pos.x,
        top:  pos.y,
        height: minimized ? 'auto' : 300,
      }}
    >
      {/* ── Header / drag handle ── */}
      <div className="copilot-header" onMouseDown={onMouseDown}>
        <div className="copilot-header-title">
          <div className="status-dot" />
          ⬡ OVERSEER AI
        </div>
        <div className="copilot-header-controls">
          <button
            className="copilot-header-btn"
            title={minimized ? 'Expand' : 'Minimize'}
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setMinimized(m => !m)}
          >
            {minimized ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* ── Log (hidden when minimized) ── */}
      {!minimized && (
        <>
          <div className="copilot-log">
            {log.map(entry => (
              <div key={entry.id} className={`copilot-entry ${entry.kind}`}>
                {entry.text}
                {entry.text === 'Processing▋' && (
                  <span className="copilot-cursor" />
                )}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          {/* ── Input row ── */}
          <div className="copilot-input-row">
            <span className="copilot-prompt">{'>'}</span>
            <input
              ref={inputRef}
              className="copilot-input"
              type="text"
              placeholder="issue command to Overseer…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={processing}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="copilot-send-btn"
              onClick={send}
              disabled={processing || !input.trim()}
            >
              SEND
            </button>
          </div>
        </>
      )}
    </div>
  );
};
