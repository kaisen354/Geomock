import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { TopologyData, TopologyNode, TopologyLink } from '../hooks/useMetrics';

// ─── Color palette keyed by node group ──────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  agents:  '#3ecf8e', // Emerald
  queue:   '#ffdb13', // Amber
  egress:  '#ff2201', // Tomato
};


const FIXED_LAYOUT: Record<string, { fx: number; fy: number }> = {
  'agent-pool': { fx: -320, fy: 0 },
  'ingestion-chan': { fx: -120, fy: 0 },
  'redis-stream': { fx: 80, fy: 0 },
  'ws-hub': { fx: 280, fy: -80 },
  'webhook-workers': { fx: 280, fy: 80 },
};

const NODE_RADIUS = 18;

interface Props {
  topology: TopologyData | null;
  currentRps: number;
}

export const TopologyMap: React.FC<Props> = ({ topology, currentRps }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const fgRef = useRef<any>(null);

  // Stable graphData object so ForceGraph doesn't re-simulate on every tick
  const graphData = useMemo(() => {
    return topology
      ? {
          nodes: topology.nodes.map(n => ({ ...n, ...FIXED_LAYOUT[n.id] })) as (TopologyNode & { x?: number; y?: number; fx?: number; fy?: number })[],
          links: topology.links.map(l => ({ ...l })),
        }
      : { nodes: [], links: [] };
  }, [topology]);

  useEffect(() => {
    if (fgRef.current && topology) {
      fgRef.current.d3ReheatSimulation();
    }
  }, [topology]);

  // ─── Custom node paint ────────────────────────────────────────────────────
  const paintNode = useCallback(
    (node: TopologyNode & { x?: number; y?: number }, ctx: CanvasRenderingContext2D) => {
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      
      const isFailing = node.status === 'failing';
      const isDegraded = node.status === 'degraded';
      
      const color = node.color ?? GROUP_COLORS[node.group] ?? '#ffffff';

      // Pulsing effect for failing nodes based on time
      const timeMs = Date.now();
      const pulse = isFailing ? (Math.sin(timeMs / 150) + 1) / 2 : 0; // 0 to 1
      const pulseRadius = NODE_RADIUS + 3 + (pulse * 8);

      // Outer ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(nx, ny, pulseRadius, 0, 2 * Math.PI);
      
      if (isFailing) {
        ctx.strokeStyle = `rgba(255, 34, 1, ${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 1 + pulse * 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fill();
      }
      ctx.restore();

      // Filled circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(nx, ny, NODE_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}`; // solid fill
      ctx.fill();
      ctx.strokeStyle = '#ffffff'; // white inner border
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.restore();

      // Label directly below the circle
      ctx.save();
      ctx.font         = '500 12px "Inter", "Helvetica Neue", sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = '#ffffff'; // --on-dark
      ctx.fillText(node.name, nx, ny + NODE_RADIUS + 8);
      
      if (node.stat) {
        ctx.font      = '400 11px "Inter", "Helvetica Neue", sans-serif';
        ctx.fillStyle = isFailing ? '#ff2201' : (isDegraded ? '#ffdb13' : 'rgba(255,255,255,0.6)'); 
        ctx.fillText(node.stat, nx, ny + NODE_RADIUS + 22);
      }
      ctx.restore();
    },
    [],
  );

  // ─── Resize observer so ForceGraph fills the container ──────────────────

  // Resize observer so ForceGraph fills the container
  const [dims, setDims] = React.useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const bottleneck = useMemo(() => {
    if (!topology || !topology.nodes) return null;
    const failing = topology.nodes.find(n => n.status === 'failing');
    if (failing) return `Bottleneck detected: ${failing.name} — ${failing.stat}`;
    const degraded = topology.nodes.find(n => n.status === 'degraded');
    if (degraded) return `System degraded: ${degraded.name} — ${degraded.stat}`;
    return "All systems nominal";
  }, [topology]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        height: '100%',
        background: 'var(--canvas-night)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Header overlay */}
      <div
        style={{
          position: 'absolute',
          top: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '0.8rem',
            letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            marginBottom: '0.25rem',
            fontWeight: 600,
          }}
        >
          Live Service Map
        </div>
        <div
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: '1.4rem',
            fontWeight: 500,
            color: 'var(--on-dark)',
            letterSpacing: '-0.02em',
          }}
        >
          Matrix Topology
        </div>
        {bottleneck && (
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '0.8rem',
              color: bottleneck.includes('Bottleneck') ? 'var(--accent-tomato)' : (bottleneck.includes('degraded') ? '#d4b000' : 'var(--primary-deep)'),
              marginTop: '0.5rem',
              fontWeight: 500,
            }}
          >
            {bottleneck}
          </div>
        )}
      </div>

      {/* RPS badge */}
      <div
        style={{
          position: 'absolute',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 10,
          background: 'var(--canvas-night-soft)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
          padding: '0.6rem 1rem',
          fontFamily: 'var(--font-ui)',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>
          Throughput
        </div>
        <div
          style={{
            fontSize: '1.4rem',
            fontWeight: 500,
            color: 'var(--on-dark)',
            marginTop: '0.2rem',
          }}
        >
          {currentRps.toLocaleString()} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>RPS</span>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: '1.5rem',
          left: '1.5rem',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          background: 'var(--canvas-night-soft)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '6px',
          padding: '0.8rem 1rem',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        {[
          { group: 'agents', label: 'Agent Pool' },
          { group: 'queue',  label: 'Queue / Stream' },
          { group: 'egress', label: 'Egress / Webhooks' },
        ].map(({ group, label }) => (
          <div key={group} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: GROUP_COLORS[group],
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '0.8rem',
                color: 'rgba(255,255,255,0.7)',
                fontWeight: 500,
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {(!topology || topology.nodes.length === 0) && (
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            zIndex: 5,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--canvas-night)',
            }}
          >
            <span style={{ fontSize: '1.8rem', color: 'rgba(255,255,255,0.3)' }}>⬡</span>
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
            Awaiting topology signal…
          </div>
        </div>
      )}

      {/* Force graph */}
      {dims.w > 0 && topology && topology.nodes.length > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dims.w}
          height={dims.h}
          backgroundColor="#1c1c1c"
          graphData={graphData}
          // Node mapping
          nodeVal={(node: any) => node.val || 5}
          nodeColor={(node: any) => node.color}
          // Node rendering
          nodeCanvasObject={paintNode as any}
          nodeCanvasObjectMode={() => 'replace'}
          nodeRelSize={NODE_RADIUS}
          // Link styling
          linkColor={(link: any) => link.color && link.color !== '' ? `${link.color}55` : 'rgba(255,255,255,0.15)'}
          linkWidth={1.5}
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={(link: any) => link.color && link.color !== '' ? link.color : 'rgba(255,255,255,0.3)'}
          // Particles
          linkDirectionalParticles={(link) => (link as TopologyLink).particles ?? 3}
          linkDirectionalParticleWidth={3}
          linkDirectionalParticleColor={(link: any) => link.color && link.color !== '' ? link.color : 'rgba(255,255,255,0.6)'}
          linkDirectionalParticleSpeed={(link: any) => (link.throughput || 0) * 0.005 + 0.002}
          // Physics
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.25}
          cooldownTicks={200}
          warmupTicks={80}
          // Interaction
          enableNodeDrag
          enableZoomInteraction
          enablePanInteraction
        />
      )}
    </div>
  );
};
