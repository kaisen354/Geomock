import React, { useState, useCallback, useRef } from 'react';
import type { LatLngBoundsExpression } from 'leaflet';

interface BoundingEnvelope {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface Props {
  children: React.ReactNode;
  onFlyTo: (bounds: LatLngBoundsExpression) => void;
}

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

export const MapDropZone: React.FC<Props> = ({ children, onFlyTo }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track drag-enter depth to handle child element transitions correctly
  const dragDepthRef = useRef(0);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); // required to allow drop
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);

    const file = Array.from(e.dataTransfer.files).find(
      f => f.name.endsWith('.geojson') || f.type === 'application/geo+json'
    );

    if (!file) {
      showToast('✗ Please drop a .geojson file');
      return;
    }

    // Quick structural validation before uploading
    const text = await file.text();
    let geoJSON: { type?: string };
    try {
      geoJSON = JSON.parse(text);
    } catch {
      showToast('✗ Invalid JSON in file');
      return;
    }
    if (geoJSON.type !== 'FeatureCollection') {
      showToast('✗ GeoJSON must be a FeatureCollection');
      return;
    }

    // Upload via multipart POST
    const form = new FormData();
    form.append('file', file);
    showToast('⟳ Uploading map...');

    let envelope: BoundingEnvelope;
    try {
      const res = await fetch(`${API_BASE}/api/upload-map`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const errText = await res.text();
        showToast(`✗ Upload failed: ${errText}`);
        return;
      }
      envelope = await res.json() as BoundingEnvelope;
    } catch {
      showToast('✗ Backend unreachable');
      return;
    }

    // Convert envelope → Leaflet LatLngBounds: [[sw_lat, sw_lng], [ne_lat, ne_lng]]
    const bounds: LatLngBoundsExpression = [
      [envelope.minLat, envelope.minLng],
      [envelope.maxLat, envelope.maxLng],
    ];
    onFlyTo(bounds);
    showToast('✓ City loaded — flying to bounds');
  }, [onFlyTo]);

  return (
    // ⚠ Drag handlers live on the WRAPPER, not a separate overlay div.
    // This means zero persistent elements sit between the user's mouse and Leaflet,
    // so scroll-to-zoom and click-to-pan work perfectly at all times.
    <div
      style={{ position: 'relative', flex: 1, height: '100%' }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {/* Visual drop feedback — only rendered while a drag is active.
          Uses pointer-events:none so it NEVER blocks Leaflet interaction. */}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 500,
            pointerEvents: 'none',        // ← never blocks Leaflet
            background: 'rgba(0, 255, 204, 0.06)',
            border: '2px dashed var(--cyan)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '1.1rem',
            color: 'var(--cyan)',
            textShadow: '0 0 16px var(--cyan-glow)',
            letterSpacing: '0.15em',
            fontWeight: 700,
          }}>
            ⬇ DROP GEOJSON TO SWAP CITY
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};
