import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Minus } from 'lucide-react';

interface SlippyTileMapProps {
  latitude: number;
  longitude: number;
  zoom?: number;
  interactive?: boolean;
  showZoomControls?: boolean;
  isRtl?: boolean;
  onSelectCoordinates?: (lat: number, lng: number) => void;
  className?: string;
}

const TILE_SIZE = 256;

function latLngToTileFloat(lat: number, lng: number, zoom: number) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const n = Math.pow(2, zoom);
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (clampedLat * Math.PI) / 180;
  const yFloat =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { xFloat, yFloat, n };
}

function tileFloatToLatLng(xFloat: number, yFloat: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const lng = (xFloat / n) * 360 - 180;
  const mercY = Math.PI * (1 - (2 * yFloat) / n);
  const lat = (Math.atan(Math.sinh(mercY)) * 180) / Math.PI;
  return {
    lat: Math.max(-85, Math.min(85, lat)),
    lng: ((((lng + 180) % 360) + 360) % 360) - 180,
  };
}

const MapTileImage: React.FC<{
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
}> = ({ z, x, y, left, top }) => {
  const [fallbackLevel, setFallbackLevel] = useState<number>(0);

  useEffect(() => {
    setFallbackLevel(0);
  }, [z, x, y]);

  // Primary: Esri/ArcGIS World Street Map (no API key, crisp Arabic/English road labels, CDN-cached)
  // Note: ArcGIS uses /{z}/{y}/{x} order, while OSM uses /{z}/{x}/{y}.png
  // Fallback: OpenStreetMap standard raster tiles
  const src =
    fallbackLevel === 0
      ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`
      : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

  if (fallbackLevel > 1) {
    return (
      <div
        className="absolute bg-[#E8EFEA]"
        style={{ left, top, width: TILE_SIZE, height: TILE_SIZE }}
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFallbackLevel((prev) => prev + 1)}
      className="absolute select-none pointer-events-none block max-w-none"
      style={{
        left,
        top,
        width: TILE_SIZE,
        height: TILE_SIZE,
      }}
    />
  );
};

/**
 * High-fidelity, zero-iframe slippy-tile map centered on exact (latitude, longitude).
 * Renders crisp Esri World Street Map tiles with automatic OSM fallback, avoiding
 * API-key watermarks, iframe CSP blocks, and static-map billing failures across all devices.
 */
export const SlippyTileMap: React.FC<SlippyTileMapProps> = ({
  latitude,
  longitude,
  zoom: initialZoom = 15,
  interactive = false,
  showZoomControls = false,
  isRtl = false,
  onSelectCoordinates,
  className = '',
}) => {
  const [zoom, setZoom] = useState<number>(initialZoom);

  useEffect(() => {
    setZoom(initialZoom);
  }, [initialZoom]);

  const { xFloat, yFloat, n } = latLngToTileFloat(latitude, longitude, zoom);
  const centerTileX = Math.floor(xFloat);
  const centerTileY = Math.floor(yFloat);
  const offsetX = (xFloat - centerTileX) * TILE_SIZE;
  const offsetY = (yFloat - centerTileY) * TILE_SIZE;

  // Render a 5x5 grid in interactive/large views or 3x3 in compact bubbles
  const radius = interactive || showZoomControls ? 2 : 1;
  const gridSpan = (radius * 2 + 1) * TILE_SIZE;
  const originPixelX = radius * TILE_SIZE + offsetX;
  const originPixelY = radius * TILE_SIZE + offsetY;

  const tiles: Array<{ key: string; tx: number; ty: number; left: number; top: number }> = [];
  for (let dy = -radius; dy <= radius; dy++) {
    const ty = centerTileY + dy;
    if (ty < 0 || ty >= n) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = ((centerTileX + dx) % n + n) % n;
      tiles.push({
        key: `${zoom}_${tx}_${ty}`,
        tx,
        ty,
        left: (dx + radius) * TILE_SIZE,
        top: (dy + radius) * TILE_SIZE,
      });
    }
  }

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !onSelectCoordinates) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const deltaX = e.clientX - cx;
    const deltaY = e.clientY - cy;
    const nextCoords = tileFloatToLatLng(
      xFloat + deltaX / TILE_SIZE,
      yFloat + deltaY / TILE_SIZE,
      zoom
    );
    onSelectCoordinates(nextCoords.lat, nextCoords.lng);
  };

  return (
    <div
      onClick={interactive ? handleMapClick : undefined}
      className={`relative w-full h-full overflow-hidden bg-[#E6EFEA] select-none ${
        interactive ? 'cursor-crosshair' : ''
      } ${className}`}
    >
      {/* Subtle architectural map grid fallback behind loading tiles */}
      <div
        className="absolute inset-0 opacity-35 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(8,127,117,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(8,127,117,0.12) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Web Mercator Tile Layer anchored to exact (latitude, longitude) */}
      <div
        className="absolute top-1/2 left-1/2 pointer-events-none"
        style={{
          width: gridSpan,
          height: gridSpan,
          transform: `translate3d(${-originPixelX}px, ${-originPixelY}px, 0)`,
        }}
      >
        {tiles.map((t) => (
          <MapTileImage
            key={t.key}
            z={zoom}
            x={t.tx}
            y={t.ty}
            left={t.left}
            top={t.top}
          />
        ))}
      </div>

      {/* Exact-coordinate WhatsApp/Telegram style center location pin */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
        <div className="relative flex flex-col items-center -translate-y-3">
          <span className="animate-ping absolute top-1 inline-flex h-8 w-8 rounded-full bg-[#087F75]/35" />
          <div className="relative w-9 h-9 rounded-full bg-[#087F75] text-white flex items-center justify-center shadow-[0_6px_16px_rgba(8,127,117,0.45)] border-2 border-white">
            <MapPin className="w-4 h-4 fill-white" />
          </div>
          <div className="w-2.5 h-1 rounded-full bg-slate-900/30 blur-[1px] mt-0.5" />
        </div>
      </div>

      {/* Optional Zoom Controls for Picker / Expanded Map */}
      {showZoomControls && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-3 ${
            isRtl ? 'right-3' : 'left-3'
          } z-20 flex flex-col bg-white/95 backdrop-blur-xs rounded-xl shadow-md border border-slate-200 overflow-hidden`}
        >
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(18, z + 1))}
            aria-label={isRtl ? 'تكبير الخريطة' : 'Zoom in'}
            className="w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer border-b border-slate-200"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(10, z - 1))}
            aria-label={isRtl ? 'تصغير الخريطة' : 'Zoom out'}
            className="w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Subtle Esri / OpenStreetMap attribution badge */}
      <div
        className={`pointer-events-none absolute bottom-1 ${
          isRtl ? 'left-1.5' : 'right-1.5'
        } z-10 px-1.5 py-0.5 rounded bg-white/80 backdrop-blur-xs text-[8px] font-medium text-slate-600 leading-none`}
      >
        © Esri · OSM
      </div>
    </div>
  );
};
