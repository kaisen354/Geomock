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
  accent: string;
  valueColor?: string;
}

const MetricCard: React.FC<CardProps> = ({ icon, label, value, unit, accent, valueColor }) => (
  <div style={{
    background: 'var(--canvas-night)',
    border: '1px solid var(--hairline)',
    borderRadius: '12px',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    position: 'relative',
    overflow: 'hidden',
  }}>
    {/* Label row */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      color: 'var(--ink-mute)', fontSize: '14px', fontWeight: 500,
      fontFamily: 'var(--font-ui)',
    }}>
      <div style={{ color: accent, display: 'flex', alignItems: 'center' }}>
        {icon}
      </div>
      <span>{label}</span>
    </div>

    {/* Value */}
    <div style={{
      fontFamily: 'var(--font-ui)',
      fontSize: '28px',
      fontWeight: 500,
      lineHeight: 1.2,
      letterSpacing: '-0.42px',
      color: valueColor ?? 'var(--on-dark)',
      display: 'flex',
      alignItems: 'baseline',
      gap: '6px',
    }}>
      {value}
      <span style={{ fontSize: '16px', fontWeight: 400, color: 'var(--ink-mute)' }}>{unit}</span>
    </div>
  </div>
);

// ─── Empty / waiting state ────────────────────────────────────
const EmptyState: React.FC = () => (
  <div style={{
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: '16px',
  }}>
    <div style={{
      width: 40, height: 40,
      border: '2px solid var(--hairline)',
      borderTop: '2px solid var(--primary)',
      borderRadius: '50%',
      animation: 'spin 1.2s linear infinite',
    }} />
    <div style={{
      fontFamily: 'var(--font-ui)', fontSize: '16px',
      color: 'var(--ink-mute)', fontWeight: 500,
    }}>
      Awaiting webhook data stream
    </div>
    <div style={{
      fontFamily: 'var(--font-ui)', fontSize: '14px',
      color: 'var(--ink-mute-2)', textAlign: 'center', lineHeight: 1.5,
    }}>
      Go to Map view → click <span style={{ color: 'var(--primary)' }}>Start Stress Test</span><br />
      Metrics will stream here in real-time via /ws/metrics
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
      background: 'var(--canvas-night)',
      display: 'flex',
      flexDirection: 'column',
      padding: '64px 96px',
      gap: '32px',
      overflow: 'auto',
      position: 'relative',
      fontFamily: 'var(--font-ui)',
    }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', position: 'relative', zIndex: 1,
        paddingBottom: '24px',
        borderBottom: '1px solid var(--hairline)',
      }}>
        <div>
          {/* Title */}
          <div style={{
            display: 'flex', alignItems: 'center',
            gap: '12px', marginBottom: '8px',
          }}>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-ui)',
              fontSize: '36px',
              fontWeight: 500,
              color: 'var(--on-dark)',
              letterSpacing: '-0.72px',
              lineHeight: 1.15,
            }}>
              System Forensics
            </h2>
          </div>

          {/* Subtitle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{
              fontSize: '18px', fontFamily: 'var(--font-ui)',
              color: 'var(--ink-mute)', fontWeight: 400,
              lineHeight: 1.55,
            }}>
              {hasData
                ? 'Performance analytics streaming from /ws/metrics'
                : 'Waiting for load test — start stress test from Map view'}
            </span>
          </div>
        </div>

        {/* LIVE badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '13px', fontWeight: 500,
          color: hasData ? 'var(--on-dark)' : 'var(--ink-mute)',
          fontFamily: 'var(--font-ui)',
          background: 'var(--canvas-night-soft)',
          border: '1px solid var(--hairline)',
          borderRadius: '12px',
          padding: '8px 16px',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: hasData ? 'var(--primary)' : 'var(--ink-mute-2)',
            display: 'inline-block',
          }} />
          {hasData ? 'Live' : 'Standby'}
        </div>
      </div>

      {/* ── Metric Cards ───────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '24px',
        position: 'relative', zIndex: 1,
        flexShrink: 0,
      }}>
        <MetricCard
          icon={<Activity size={18} />}
          label="Requests Made"
          value={metrics.totalRequestsMade.toLocaleString()}
          unit="reqs"
          accent="var(--primary-soft)"
        />
        <MetricCard
          icon={<AlertTriangle size={18} />}
          label="HTTP Failures"
          value={metrics.httpFailures.toLocaleString()}
          unit="reqs"
          accent="var(--accent-purple)"
          valueColor={metrics.httpFailures > 0 ? 'var(--accent-purple)' : undefined}
        />
        <MetricCard
          icon={<Zap size={18} />}
          label="Current RPS"
          value={metrics.currentRps.toLocaleString()}
          unit="req/s"
          accent="var(--primary)"
        />
        <MetricCard
          icon={<Clock size={18} />}
          label="P95 Response"
          value={p95Display.value}
          unit={p95Display.unit}
          accent="var(--accent-yellow)"
        />
      </div>

      {/* ── Chart ──────────────────────────────────────────── */}
      <div style={{
        flex: 1, minHeight: 400,
        background: 'var(--canvas-night-soft)',
        border: '1px solid var(--hairline)',
        borderRadius: '12px',
        padding: hasData ? '32px 16px 16px 0' : '0',
        position: 'relative', zIndex: 1,
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
      }}>
        {!hasData ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 55, left: 30, bottom: 35 }}>
              <defs>
                <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--accent-purple)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--accent-purple)" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--accent-yellow)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--accent-yellow)" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--ink-mute-2)"
                vertical={false}
                opacity={0.2}
              />

              <XAxis
                dataKey="time"
                stroke="var(--hairline-strong)"
                tick={{ fill: 'var(--ink-mute)', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                tickMargin={16}
                minTickGap={32}
                axisLine={{ stroke: 'var(--hairline-strong)' }}
              />

              {/* Left axis — counts */}
              <YAxis
                yAxisId="left"
                stroke="var(--hairline-strong)"
                tick={{ fill: 'var(--ink-mute)', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                domain={[0, 'auto']}
                axisLine={false}
                tickLine={false}
                label={{
                  value: 'Failure / Request Rate',
                  angle: -90,
                  position: 'insideLeft',
                  offset: -10,
                  fill: 'var(--ink-mute)',
                  style: { textAnchor: 'middle', fontFamily: 'var(--font-ui)', fontSize: 13 },
                }}
              />

              {/* Right axis — seconds */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--hairline-strong)"
                tick={{ fill: 'var(--ink-mute)', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                domain={[0, 'auto']}
                tickFormatter={v => `${v}s`}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                contentStyle={{
                  background: 'var(--canvas-night)',
                  border: '1px solid var(--hairline)',
                  borderRadius: '8px',
                  boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
                  fontFamily: 'var(--font-ui)',
                  padding: '16px',
                }}
                itemStyle={{ fontSize: '14px', color: 'var(--on-dark)', fontWeight: 500 }}
                labelStyle={{ fontSize: '13px', color: 'var(--ink-mute)', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}
                formatter={(v: any, name: any) =>
                  name === 'Response time (s)'
                    ? [`${v.toFixed(3)} s`, name]
                    : [v.toLocaleString(), name]
                }
              />

              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{
                  paddingTop: '24px',
                  fontSize: '13px',
                  fontFamily: 'var(--font-ui)',
                  color: 'var(--ink-mute)',
                }}
              />

              {/* Failure rate */}
              <Area
                yAxisId="left" type="monotone"
                dataKey="httpFailures" name="Failure rate"
                stroke="var(--accent-purple)" strokeWidth={2}
                fill="url(#gF)" fillOpacity={1}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: 'var(--accent-purple)', stroke: 'var(--canvas-night)', strokeWidth: 2 }}
              />
              {/* Request rate */}
              <Area
                yAxisId="left" type="monotone"
                dataKey="currentRps" name="Request rate"
                stroke="var(--primary)" strokeWidth={2}
                fill="url(#gR)" fillOpacity={1}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--canvas-night)', strokeWidth: 2 }}
              />
              {/* P95 Response time */}
              <Area
                yAxisId="right" type="monotone"
                dataKey="p95Sec" name="Response time (s)"
                stroke="var(--accent-yellow)" strokeWidth={2}
                fill="url(#gP)" fillOpacity={1}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: 'var(--accent-yellow)', stroke: 'var(--canvas-night)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
