import React, { useEffect, useRef, useState } from 'react';
import {
  Cpu,
  Radio,
  Map,
  BarChart2,
  BrainCircuit,
  GitBranch,
  Zap,
  Upload,
  ArrowRight,
} from 'lucide-react';

/* Inline GitHub icon — avoids lucide version issues */
const GithubIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.483 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);


interface Props {
  onEnter: () => void;
}

/* ─── tiny hook: count-up animation ─── */
function useCountUp(target: number, duration = 1400, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf: number;
    const startTime = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1);
      setValue(Math.floor(p * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

/* ─── animated ticker stat ─── */
const Stat: React.FC<{ value: number; suffix: string; label: string; visible: boolean }> = ({
  value,
  suffix,
  label,
  visible,
}) => {
  const v = useCountUp(value, 1600, visible);
  return (
    <div className="wlc-stat">
      <span className="wlc-stat-num">
        {v.toLocaleString()}
        {suffix}
      </span>
      <span className="wlc-stat-lbl">{label}</span>
    </div>
  );
};

/* ─── feature card ─── */
interface FCard {
  icon: React.ReactNode;
  title: string;
  body: string;
  tag?: string;
  accent?: string;   // CSS color for the accent strip
  large?: boolean;   // span 2 cols on the grid
  visual?: React.ReactNode;
}

const FEATURES: FCard[] = [
  {
    icon: <Cpu size={20} />,
    title: 'Simulation Engine',
    body: 'Spin up 1 000+ autonomous driver agents in a single command, each navigating realistic road-graph routes at configurable tick-rates.',
    tag: 'Core',
    accent: '#3ecf8e',
    visual: (
      <div className="wlc-card-visual wlc-visual-engine">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="wlc-dot" style={{ animationDelay: `${i * 0.07}s` }} />
        ))}
      </div>
    ),
  },
  {
    icon: <Radio size={20} />,
    title: 'Live WebSocket Feed',
    body: 'Sub-second telemetry streamed directly to your browser over a persistent WebSocket — no polling, no delay.',
    accent: '#644fc1',
    visual: (
      <div className="wlc-card-visual wlc-visual-ws">
        <div className="wlc-ws-bar" style={{ '--h': '35%' } as React.CSSProperties} />
        <div className="wlc-ws-bar" style={{ '--h': '65%' } as React.CSSProperties} />
        <div className="wlc-ws-bar" style={{ '--h': '50%' } as React.CSSProperties} />
        <div className="wlc-ws-bar" style={{ '--h': '80%' } as React.CSSProperties} />
        <div className="wlc-ws-bar" style={{ '--h': '45%' } as React.CSSProperties} />
        <div className="wlc-ws-bar" style={{ '--h': '70%' } as React.CSSProperties} />
        <div className="wlc-ws-bar" style={{ '--h': '55%' } as React.CSSProperties} />
        <div className="wlc-ws-bar" style={{ '--h': '90%' } as React.CSSProperties} />
      </div>
    ),
  },
  {
    icon: <Map size={20} />,
    title: 'GeoJSON Map Drop',
    body: 'Drag-and-drop any GeoJSON FeatureCollection onto the live map. Agents instantly rescatter inside the new bounding envelope.',
    accent: '#ffdb13',
    visual: (
      <div className="wlc-card-visual wlc-visual-map">
        <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', opacity: 0.55 }}>
          <path d="M10 30 Q25 10 40 30 Q55 50 70 30" stroke="#ffdb13" strokeWidth="1.5" fill="none" />
          <path d="M15 45 Q30 25 50 40 Q65 55 75 40" stroke="#ffdb13" strokeWidth="1" fill="none" opacity="0.5"/>
          <circle cx="40" cy="30" r="3" fill="#ffdb13" />
          <circle cx="20" cy="38" r="2" fill="#ffdb13" opacity="0.6"/>
          <circle cx="60" cy="22" r="2" fill="#ffdb13" opacity="0.6"/>
        </svg>
      </div>
    ),
  },
  {
    icon: <BarChart2 size={20} />,
    title: 'Performance Analytics',
    body: 'Real-time throughput charts, latency histograms, and anomaly counters — all rendered via live WebSocket metrics.',
    accent: '#3ecf8e',
    visual: (
      <div className="wlc-card-visual wlc-visual-chart">
        {[40, 65, 52, 78, 61, 84, 70, 95, 80].map((h, i) => (
          <div key={i} className="wlc-chart-bar" style={{ height: `${h}%`, animationDelay: `${i * 0.09}s` }} />
        ))}
      </div>
    ),
  },
  {
    icon: <BrainCircuit size={20} />,
    title: 'Overseer AI',
    body: 'A Gemini-powered copilot that understands plain-English commands — "send 500 agents to Tokyo" — and drives the simulation on your behalf.',
    tag: 'AI',
    accent: '#c7007e',
    visual: (
      <div className="wlc-card-visual wlc-visual-ai">
        <code className="wlc-ai-code">
          <span style={{ color: '#c7007e' }}>{'> '}</span>
          <span style={{ color: '#fff' }}>scatter 200 agents over London</span>
          <br />
          <span style={{ color: '#3ecf8e' }}>⬡ Agents teleported to London bounds.</span>
        </code>
      </div>
    ),
  },
  {
    icon: <GitBranch size={20} />,
    title: 'Road-Graph Routing',
    body: 'Agents follow real street topology parsed from uploaded GeoJSON — no more random-walk drift across water.',
    accent: '#054cff',
    visual: (
      <div className="wlc-card-visual wlc-visual-graph">
        <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', opacity: 0.6 }}>
          <line x1="10" y1="50" x2="35" y2="20" stroke="#054cff" strokeWidth="1.5"/>
          <line x1="35" y1="20" x2="60" y2="35" stroke="#054cff" strokeWidth="1.5"/>
          <line x1="60" y1="35" x2="70" y2="10" stroke="#054cff" strokeWidth="1.5"/>
          <line x1="35" y1="20" x2="50" y2="50" stroke="#054cff" strokeWidth="1"/>
          <circle cx="10" cy="50" r="3" fill="#054cff"/>
          <circle cx="35" cy="20" r="3" fill="#054cff"/>
          <circle cx="60" cy="35" r="3" fill="#054cff"/>
          <circle cx="70" cy="10" r="3" fill="#054cff"/>
          <circle cx="50" cy="50" r="2.5" fill="#054cff" opacity="0.7"/>
        </svg>
      </div>
    ),
  },
  {
    icon: <Zap size={20} />,
    title: 'Redis Stream Pipeline',
    body: 'Every telemetry tick is published to a Redis Stream consumer group, enabling replay, fan-out, and load-test webhook forwarding.',
    accent: '#ff2201',
    visual: (
      <div className="wlc-card-visual wlc-visual-redis">
        <div className="wlc-redis-stream">
          {['telemetry:stream', 'consumer:group', 'webhook:forward'].map((t, i) => (
            <span key={i} className="wlc-redis-chip" style={{ animationDelay: `${i * 0.3}s` }}>{t}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: <Upload size={20} />,
    title: 'Load-Test Forwarder',
    body: 'Pipe live telemetry to any HTTP endpoint to stress-test your own ingestion services with 1 000 msg/s of realistic geo payloads.',
    accent: '#3ecf8e',
    visual: (
      <div className="wlc-card-visual wlc-visual-load">
        <div className="wlc-load-row">
          <span className="wlc-load-key">target</span>
          <span className="wlc-load-val">localhost:9999/ingest</span>
        </div>
        <div className="wlc-load-row">
          <span className="wlc-load-key">rate</span>
          <span className="wlc-load-val" style={{ color: '#3ecf8e' }}>1 000 msg/s</span>
        </div>
        <div className="wlc-load-row">
          <span className="wlc-load-key">status</span>
          <span className="wlc-load-val" style={{ color: '#3ecf8e' }}>● forwarding</span>
        </div>
      </div>
    ),
  },
];

/* ─── main component ─── */
export const WelcomePage: React.FC<Props> = ({ onEnter }) => {
  const heroRef = useRef<HTMLDivElement>(null);
  const [statsVisible, setStatsVisible] = useState(false);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setStatsVisible(true); },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="wlc-root">
      {/* ── Subtle grid backdrop ── */}
      <div className="wlc-grid-bg" aria-hidden />

      {/* ══════════════════════════════════════════
          HERO
      ══════════════════════════════════════════ */}
      <section className="wlc-hero" ref={heroRef}>
        <div className="wlc-container">
          {/* Logo */}
          <img src="/logo.png" alt="GeoMock Logo" className="wlc-hero-logo" />

          {/* headline */}
          <h1 className="wlc-headline">
            Mock geo-data<br />
            <span className="wlc-headline-accent">at any scale.</span>
          </h1>

          {/* sub-copy */}
          <p className="wlc-subtext">
            GeoMock is an open-source, end-to-end geospatial simulation platform.
            Instantly spawn thousands of autonomous driver agents, stream live
            telemetry over WebSockets, visualise movement on an interactive map,
            and stress-test your own ingestion pipelines — all from a single
            Go&nbsp;backend with a React frontend.
          </p>

          {/* CTA row */}
          <div className="wlc-cta-row">
            <button
              id="wlc-enter-btn"
              className="wlc-btn-primary"
              onClick={onEnter}
            >
              Open the App
              <ArrowRight size={16} strokeWidth={2.5} />
            </button>
            <a
              id="wlc-github-btn"
              className="wlc-btn-outline"
              href="https://github.com/kaisen354/geomock"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GithubIcon size={16} />
              GitHub Repo
            </a>
          </div>

          {/* animated stats */}
          <div className="wlc-stats-row">
            <Stat value={1000}  suffix="+"  label="concurrent agents"   visible={statsVisible} />
            <div className="wlc-stats-div" />
            <Stat value={60}    suffix=" FPS" label="canvas lock"        visible={statsVisible} />
            <div className="wlc-stats-div" />
            <Stat value={1}     suffix=" ms"  label="Redis latency"      visible={statsVisible} />
            <div className="wlc-stats-div" />
            <Stat value={50}    suffix=" MB"  label="max GeoJSON upload"  visible={statsVisible} />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          FEATURE GRID
      ══════════════════════════════════════════ */}
      <section className="wlc-features-section">
        <div className="wlc-container">
          <h2 className="wlc-section-heading">Everything you need to mock the world</h2>
          <p className="wlc-section-sub">
            Eight tightly integrated subsystems — simulation kernel to AI copilot — all
            open-source, all hackable.
          </p>

          <div className="wlc-feature-grid">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className={`wlc-card ${f.large ? 'wlc-card--large' : ''}`}
                style={{ '--accent': f.accent } as React.CSSProperties}
              >
                {/* accent strip */}
                <div className="wlc-card-strip" />

                <div className="wlc-card-inner">
                  {/* header */}
                  <div className="wlc-card-header">
                    <span className="wlc-card-icon" style={{ color: f.accent }}>
                      {f.icon}
                    </span>
                    {f.tag && (
                      <span className="wlc-card-tag" style={{ background: f.accent + '22', color: f.accent }}>
                        {f.tag}
                      </span>
                    )}
                  </div>

                  <h3 className="wlc-card-title">{f.title}</h3>
                  <p className="wlc-card-body">{f.body}</p>

                  {/* visual block */}
                  {f.visual}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          BOTTOM CTA BAND
      ══════════════════════════════════════════ */}
      <section className="wlc-band">
        <div className="wlc-container wlc-band-inner">
          <div>
            <h2 className="wlc-band-heading">Ready to simulate the world?</h2>
            <p className="wlc-band-sub">Open the live app or star us on GitHub.</p>
          </div>
          <div className="wlc-cta-row">
            <button
              id="wlc-enter-btn-2"
              className="wlc-btn-primary"
              onClick={onEnter}
            >
              Open the App
              <ArrowRight size={16} strokeWidth={2.5} />
            </button>
            <a
              id="wlc-github-btn-2"
              className="wlc-btn-outline"
              href="https://github.com/kaisen354/geomock"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GithubIcon size={16} />
              GitHub Repo
            </a>
          </div>
        </div>
      </section>

      {/* footer micro */}
      <footer className="wlc-footer">
        GeoMock is open-source software. Built with Go, React, Redis &amp; Leaflet.
      </footer>
    </div>
  );
};
