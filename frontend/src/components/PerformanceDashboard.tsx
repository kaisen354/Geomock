import React, { useMemo } from 'react';
import {
  AreaChart, Area, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { Activity, AlertTriangle, Zap, Clock } from 'lucide-react';
import { useMetrics } from '../hooks/useMetrics';

// ─── Metric Card ─────────────────────────────────────────────
interface CardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  accent: string;      // border + icon colour
  valueColor?: string; // override value colour (e.g. red on failures)
}

const MetricCard: React.FC<CardProps> = ({ icon, label, value, unit, accent, valueColor }) => (
  <div style={{
    background: 'rgba(8, 14, 26, 0.85)',
    border: `1px solid rgba(255,255,255,0.07)`,
    borderTop: `2px solid ${accent}`,
    borderRadius: '6px',
    padding: '1.1rem 1.4rem 0.9rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.55rem',
    backdropFilter: 'blur(12px)',
    boxShadow: `0 0 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)`,
    position: 'relative',
    overflow: 'hidden',
  }}>
    {/* Subtle corner glow matching accent */}
    <div style={{
      position: 'absolute', top: 0, right: 0,
      width: 80, height: 80,
      background: `radial-gradient(circle at top right, ${accent}14, transparent 70%)`,
      pointerEvents: 'none',
    }} />

    {/* Label row */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.4rem',
      color: accent, fontSize: '0.68rem', fontWeight: 600,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      fontFamily: 'var(--font-mono)',
    }}>
      {icon}
      <span>{label}</span>
    </div>

    {/* Value */}
    <div style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '2.25rem',
      fontWeight: 700,
      lineHeight: 1,
      color: valueColor ?? 'rgba(255,255,255,0.92)',
      textShadow: valueColor ? `0 0 20px ${valueColor}80` : '0 0 12px rgba(255,255,255,0.15)',
      display: 'flex',
      alignItems: 'baseline',
      gap: '0.35rem',
    }}>
      {value}
      <span style={{ fontSize: '1rem', fontWeight: 400, color: 'rgba(255,255,255,0.45)' }}>{unit}</span>
    </div>

    {/* Sparkline bar */}
    <div style={{
      height: 3, borderRadius: 2,
      background: `linear-gradient(90deg, ${accent}, ${accent}66)`,
      boxShadow: `0 0 8px ${accent}88`,
      marginTop: '0.1rem',
      width: '60%',
    }} />
  </div>
);

// ─── Empty / waiting state ────────────────────────────────────
const EmptyState: React.FC = () => (
  <div style={{
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: '1rem',
  }}>
    <div style={{
      width: 40, height: 40,
      border: '2px solid rgba(0,255,204,0.15)',
      borderTop: '2px solid #00ffcc',
      borderRadius: '50%',
      animation: 'spin 1.2s linear infinite',
    }} />
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
      color: 'rgba(0,255,204,0.45)', letterSpacing: '0.12em',
    }}>
      ⟳ AWAITING WEBHOOK DATA STREAM
    </div>
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.7rem',
      color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em',
      textAlign: 'center', lineHeight: 2,
    }}>
      Go to Map view → click <span style={{ color: 'rgba(0,255,204,0.5)' }}>▶ START STRESS TEST</span><br />
      Metrics will stream here in real-time via{' '}
      <span style={{ color: 'rgba(0,255,204,0.5)' }}>/ws/metrics</span>
    </div>
  </div>
);

// ─── Main Dashboard ───────────────────────────────────────────
export const PerformanceDashboard: React.FC = () => {
  const { metrics, history } = useMetrics();
  const hasData = history.length > 0;

  // Derive chart-ready data: p95 in seconds for right axis
  const chartData = useMemo(() =>
    history.map(h => ({
      time: h.time ?? '',
      httpFailures: h.httpFailures,
      currentRps: h.currentRps,
      p95Sec: +(h.p95ResponseTime / 1000).toFixed(3),
    })),
    [history]
  );

  // P95 display in card
  const p95Display = metrics.p95ResponseTime >= 1000
    ? { value: (metrics.p95ResponseTime / 1000).toFixed(2), unit: 's' }
    : { value: metrics.p95ResponseTime.toString(), unit: 'ms' };

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: 'linear-gradient(160deg, #060c18 0%, #040810 100%)',
      display: 'flex',
      flexDirection: 'column',
      padding: '1.75rem 2rem 1.25rem',
      gap: '1.4rem',
      overflow: 'hidden',
      position: 'relative',
      fontFamily: 'var(--font-mono)',
    }}>

      {/* Subtle dot-grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage:
          'radial-gradient(circle, rgba(0,255,204,0.06) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        opacity: 0.5,
      }} />

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', position: 'relative', zIndex: 1,
        paddingBottom: '1.1rem',
        borderBottom: '1px solid rgba(0,255,204,0.12)',
      }}>
        <div>
          {/* Title */}
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: '0.55rem', marginBottom: '0.5rem',
          }}>
            <span style={{
              color: 'var(--cyan)', fontSize: '1.1rem',
              fontWeight: 700, lineHeight: 1,
            }}>›</span>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-mono)',
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--cyan)',
              letterSpacing: '0.14em',
              textShadow: '0 0 24px rgba(0,255,204,0.45)',
            }}>
              SYSTEM FORENSICS — PERFORMANCE ANALYTICS
            </h2>
          </div>

          {/* Subtitle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
          }}>
            <div style={{
              width: 2, height: '1.1em',
              background: 'var(--cyan)',
              boxShadow: '0 0 6px var(--cyan)',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: '0.75rem', fontFamily: 'var(--font-ui)',
              color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em',
            }}>
              {hasData
                ? 'Live data streaming from /ws/metrics'
                : 'Waiting for load test — start stress test from Map view'}
            </span>
          </div>
        </div>

        {/* LIVE badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.45rem',
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em',
          color: hasData ? '#00ff88' : 'rgba(255,204,0,0.75)',
          fontFamily: 'var(--font-mono)',
          background: hasData ? 'rgba(0,255,136,0.07)' : 'rgba(255,204,0,0.06)',
          border: `1px solid ${hasData ? 'rgba(0,255,136,0.25)' : 'rgba(255,204,0,0.2)'}`,
          borderRadius: '4px',
          padding: '0.3rem 0.65rem',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: hasData ? '#00ff88' : '#ffcc00',
            boxShadow: hasData ? '0 0 8px #00ff88' : '0 0 8px #ffcc00',
            display: 'inline-block',
            animation: 'pulse-dot 1.4s ease-in-out infinite',
          }} />
          {hasData ? '⊳◁ LIVE' : '◌ STANDBY'}
        </div>
      </div>

      {/* ── Metric Cards ───────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1rem',
        position: 'relative', zIndex: 1,
        flexShrink: 0,
      }}>
        <MetricCard
          icon={<Activity size={13} />}
          label="Requests Made"
          value={metrics.totalRequestsMade.toLocaleString()}
          unit="reqs"
          accent="#00ffcc"
        />
        <MetricCard
          icon={<AlertTriangle size={13} />}
          label="HTTP Failures"
          value={metrics.httpFailures.toLocaleString()}
          unit="reqs"
          accent="#ff00aa"
          valueColor={metrics.httpFailures > 0 ? '#ff00aa' : undefined}
        />
        <MetricCard
          icon={<Zap size={13} />}
          label="Current RPS"
          value={metrics.currentRps.toLocaleString()}
          unit="req/s"
          accent="#00dd88"
        />
        <MetricCard
          icon={<Clock size={13} />}
          label="P95 Response Time"
          value={p95Display.value}
          unit={p95Display.unit}
          accent="#00aaff"
        />
      </div>

      {/* ── Chart ──────────────────────────────────────────── */}
      <div style={{
        flex: 1, minHeight: 0,
        background: 'rgba(4, 8, 18, 0.75)',
        border: '1px solid rgba(255,255,255,0.055)',
        borderRadius: '6px',
        padding: hasData ? '1.25rem 0.5rem 0.25rem 0' : '0',
        position: 'relative', zIndex: 1,
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
      }}>
        {!hasData ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 55, left: 30, bottom: 35 }}>
              <defs>
                <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#ff00aa" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#ff00aa" stopOpacity={0.12} />
                </linearGradient>
                <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#00ff88" stopOpacity={0.65} />
                  <stop offset="100%" stopColor="#00ff88" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#00aaff" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#00aaff" stopOpacity={0.04} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 8"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />

              <XAxis
                dataKey="time"
                stroke="rgba(255,255,255,0.08)"
                tick={{ fill: 'rgba(255,255,255,0.38)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                tickMargin={10}
                minTickGap={28}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />

              {/* Left axis — counts */}
              <YAxis
                yAxisId="left"
                stroke="rgba(255,255,255,0.08)"
                tick={{ fill: 'rgba(255,255,255,0.38)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                domain={[0, 'auto']}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                label={{
                  value: 'Failure / Request Rate [per sec]',
                  angle: -90,
                  position: 'insideLeft',
                  offset: -14,
                  fill: 'rgba(255,255,255,0.28)',
                  style: { textAnchor: 'middle', fontFamily: 'var(--font-ui)', fontSize: 10 },
                }}
              />

              {/* Right axis — seconds */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="rgba(255,255,255,0.08)"
                tick={{ fill: 'rgba(255,255,255,0.38)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
                domain={[0, 'auto']}
                tickFormatter={v => `${v}s`}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />

              <Tooltip
                contentStyle={{
                  background: 'rgba(4,8,20,0.97)',
                  border: '1px solid rgba(0,255,204,0.2)',
                  borderRadius: '5px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                  fontFamily: 'var(--font-mono)',
                }}
                itemStyle={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)' }}
                labelStyle={{ fontSize: '11px', color: 'rgba(0,255,204,0.55)', marginBottom: '6px' }}
                formatter={(v: number, name: string) =>
                  name === 'Response time (s)'
                    ? [`${v.toFixed(3)} s`, name]
                    : [v.toLocaleString(), name]
                }
              />

              <Legend
                verticalAlign="bottom"
                iconType="square"
                iconSize={10}
                wrapperStyle={{
                  paddingTop: '12px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-ui)',
                  color: 'rgba(255,255,255,0.45)',
                }}
              />

              {/* Failure rate — most prominent, rendered first so others sit on top */}
              <Area
                yAxisId="left" type="monotone"
                dataKey="httpFailures" name="Failure rate"
                stroke="#ff00aa" strokeWidth={2}
                fill="url(#gF)" fillOpacity={1}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: '#ff00aa', stroke: '#fff', strokeWidth: 1 }}
              />
              {/* Request rate */}
              <Area
                yAxisId="left" type="monotone"
                dataKey="currentRps" name="Request rate"
                stroke="#00ff88" strokeWidth={1.5}
                fill="url(#gR)" fillOpacity={1}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: '#00ff88', stroke: '#fff', strokeWidth: 1 }}
              />
              {/* P95 Response time */}
              <Area
                yAxisId="right" type="monotone"
                dataKey="p95Sec" name="Response time (s)"
                stroke="#00aaff" strokeWidth={2}
                fill="url(#gP)" fillOpacity={1}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: '#00aaff', stroke: '#fff', strokeWidth: 1 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
