import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TelemetryHandle } from '../hooks/useTelemetry';

// ─── Public API exposed via ref ───────────────────────────────
export interface LiveMapHandle {
  flyToBounds: (bounds: LatLngBoundsExpression) => void;
}

interface Props {
  telemetry: TelemetryHandle;
}

// ─── CartoDB dark tile URL ────────────────────────────────────
const DARK_TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_ATTR =
  '&copy; <a href="https://carto.com/">CARTO</a> | &copy; OSM contributors';

// ─── Canvas Overlay – the performance core ────────────────────
// This component creates a raw <canvas> element positioned on top of the
// Leaflet map container and drives a requestAnimationFrame loop.
// It never calls setState or forceUpdate — it only mutates canvas pixels.
const CanvasOverlay: React.FC<{ telemetry: TelemetryHandle }> = ({ telemetry }) => {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const pathsRef = useRef<Map<string, { lat: number, lng: number }>>(new Map());
  const segmentsRef = useRef<{ from: {lat: number, lng: number}, to: {lat: number, lng: number}, isGold: boolean, time: number }[]>([]);

  useEffect(() => {
    const container = map.getContainer();

    // Create and attach canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:450;';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // ── Resize canvas pixels to match DOM size ──────────────
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // ── rAF draw loop ────────────────────────────────────────
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      const { clientWidth: W, clientHeight: H } = container;
      
      // Clean canvas every frame — fixes all ghosting/web bugs!
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const agents = telemetry.agentsRef.current;
      const paths = pathsRef.current;
      const segments = segmentsRef.current;

      if (agents.size === 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Cleanup old agents
      if (Math.random() < 0.01) {
        for (const id of paths.keys()) {
          if (!agents.has(id)) {
            paths.delete(id);
          }
        }
      }

      // ── Draw Cyberpunk Data Grid Overlay ─────────────────
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.05)'; // subtle cyan grid
      ctx.lineWidth = 1;
      const gridSize = 100;
      const center = map.latLngToContainerPoint(map.getCenter());
      const offsetX = center.x % gridSize;
      const offsetY = center.y % gridSize;
      
      ctx.beginPath();
      for (let x = -gridSize; x < W + gridSize; x += gridSize) {
        ctx.moveTo(x + offsetX, 0);
        ctx.lineTo(x + offsetX, H);
      }
      for (let y = -gridSize; y < H + gridSize; y += gridSize) {
        ctx.moveTo(0, y + offsetY);
        ctx.lineTo(W, y + offsetY);
      }
      ctx.stroke();
      ctx.restore();

      // ── Set Luminous Bloom Effect ────────────────────────
      ctx.globalCompositeOperation = 'screen';

      const now = Date.now();

      // 1. Process new agent positions & push to segments array
      for (const [id, pt] of agents.entries()) {
        const lastPt = paths.get(id);
        
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
          hash = (hash << 5) - hash + id.charCodeAt(i);
        }
        const isGold = Math.abs(hash) % 100 < 35; 

        if (lastPt && (lastPt.lat !== pt.lat || lastPt.lng !== pt.lng)) {
          // If agent moved more than ~500m in one tick, it teleported. Don't draw a line!
          const dLat = Math.abs(lastPt.lat - pt.lat);
          const dLng = Math.abs(lastPt.lng - pt.lng);
          if (dLat < 0.005 && dLng < 0.005) {
             segments.push({
               from: { lat: lastPt.lat, lng: lastPt.lng },
               to: { lat: pt.lat, lng: pt.lng },
               isGold,
               time: now
             });
          }
        }
        paths.set(id, { lat: pt.lat, lng: pt.lng });
      }

      // 2. Filter out dead segments & draw active ones
      const FADE_MS = 2500; // 2.5 seconds tail
      segmentsRef.current = segments.filter(seg => now - seg.time < FADE_MS);

      for (const seg of segmentsRef.current) {
         const opacity = Math.max(0, 1.0 - (now - seg.time) / FADE_MS);
         if (opacity <= 0) continue;

         const p1 = map.latLngToContainerPoint([seg.from.lat, seg.from.lng]);
         const p2 = map.latLngToContainerPoint([seg.to.lat, seg.to.lng]);

         if (Math.min(p1.x, p2.x) > W + 100 || Math.max(p1.x, p2.x) < -100 || 
             Math.min(p1.y, p2.y) > H + 100 || Math.max(p1.y, p2.y) < -100) {
           continue;
         }

         const baseColor = seg.isGold ? '#ffaa00' : '#00e5ff';
         ctx.save();
         ctx.beginPath();
         ctx.moveTo(p1.x, p1.y);
         ctx.lineTo(p2.x, p2.y);
         
         ctx.strokeStyle = baseColor;
         ctx.lineWidth = seg.isGold ? 2.5 : 1.5;
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         
         ctx.shadowBlur = seg.isGold ? 15 : 10;
         ctx.shadowColor = baseColor;
         // non-linear fade looks cooler for lasers
         ctx.globalAlpha = 0.8 * Math.pow(opacity, 1.5); 
         ctx.stroke();
         ctx.restore();
      }

      // 3. Draw agent heads
      for (const [id, pt] of agents.entries()) {
        const currentPt = map.latLngToContainerPoint([pt.lat, pt.lng]);
        if (currentPt.x < -100 || currentPt.x > W + 100 || currentPt.y < -100 || currentPt.y > H + 100) continue;

        let hash = 0;
        for (let i = 0; i < id.length; i++) {
          hash = (hash << 5) - hash + id.charCodeAt(i);
        }
        const isGold = Math.abs(hash) % 100 < 35; 

        ctx.save();
        ctx.beginPath();
        ctx.arc(currentPt.x, currentPt.y, isGold ? 2.5 : 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 15;
        ctx.shadowColor = isGold ? '#ffaa00' : '#00e5ff';
        ctx.globalAlpha = 1.0;
        ctx.fill();
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    // Re-resize on Leaflet events
    const onMapChange = () => {
      resize();
    };
    map.on('resize moveend zoomend', onMapChange);

    return () => {
      cancelAnimationFrame(rafRef.current);
      map.off('resize moveend zoomend', onMapChange);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [map, telemetry]);

  return null; // renders nothing into the React tree
};

// ─── FlyTo controller (reads imperative handle from parent) ──
const FlyController = forwardRef<LiveMapHandle>((_props, ref) => {
  const map = useMap();

  useImperativeHandle(ref, () => ({
    flyToBounds: (bounds: LatLngBoundsExpression) => {
      map.flyToBounds(bounds, { duration: 1.8, easeLinearity: 0.3 });
    },
  }));

  return null;
});
FlyController.displayName = 'FlyController';

// ─── LiveMap ──────────────────────────────────────────────────
export const LiveMap = forwardRef<LiveMapHandle, Props>(({ telemetry }, ref) => {
  return (
    <MapContainer
      center={[37.7749, -122.4194]}
      zoom={12}
      zoomControl={true}
      style={{ width: '100%', height: '100%', background: '#020408' }}
      preferCanvas={true}
    >
      <TileLayer
        url={DARK_TILE_URL}
        attribution={DARK_TILE_ATTR}
        maxZoom={19}
        subdomains="abcd"
        detectRetina={true}
      />
      <CanvasOverlay telemetry={telemetry} />
      <FlyController ref={ref} />
    </MapContainer>
  );
});
LiveMap.displayName = 'LiveMap';
