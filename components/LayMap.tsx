'use client';

import { useState, type ReactNode } from 'react';
import { routeArrow, routePixels, svgPath, type MapViewport, type RoadSide, type RoutePolyline } from '../lib/geo';
import { MAP_COLORS, staticMapUrl } from '../lib/staticmap';

export type MapProps = {
  viewport: MapViewport;
  /** A browser-restricted Static Maps key; never pass a server credential. */
  apiKey: string;
  className?: string;
};
export type LayLeg = {
  id: string;
  /** Directions order must match the apparatus's travel direction. */
  route: RoutePolyline;
  side: RoadSide;
  direction: 'toward-fire' | 'away-from-fire';
  label?: string;
};
export type LayMapProps = MapProps & { lays: readonly LayLeg[]; offsetPx?: number };

export function MapFrame({ viewport, apiKey, className, children, label, caption }: MapProps & { children: ReactNode; label: string; caption: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  let src: string;
  try { src = staticMapUrl({ ...viewport, apiKey }); }
  catch { return <p role="status">Map unavailable — map configuration missing or invalid.</p>; }
  return <figure className={className} style={{ margin: 0 }}>
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${viewport.width}/${viewport.height}`, background: MAP_COLORS.landscape }}>
      {failedUrl === src ? <p role="status">Map unavailable — basemap could not load.</p> : <>
        <img src={src} alt={label} width={viewport.width} height={viewport.height} onError={() => setFailedUrl(src)} style={{ display: 'block', width: '100%', height: '100%' }} />
        <svg viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-label={caption} role="img" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'none', pointerEvents: 'none' }}>
          <title>{caption}</title>
          {children}
        </svg>
      </>}
    </div>
    <figcaption style={{ color: MAP_COLORS.label, fontSize: 12, marginTop: 8 }}>{caption}</figcaption>
  </figure>;
}

export function RouteOverlay({ points, color, hollow = false, dashed = false, label }: { points: ReturnType<typeof routePixels>; color: string; hollow?: boolean; dashed?: boolean; label: string }) {
  const arrow = routeArrow(points);
  return <g aria-label={label}>
    <title>{label}</title>
    <path d={svgPath(points)} fill="none" stroke={color} strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dashed ? '10 7' : undefined} />
    <g transform={`translate(${arrow.x},${arrow.y}) rotate(${arrow.angle})`}>
      {/* An opaque interior keeps the underlying route from filling the hollow arrow. */}
      <path d="M-12 -10 L14 0 L-12 10 Z" fill={hollow ? MAP_COLORS.landscape : color} stroke={color} strokeWidth={3} strokeLinejoin="round" />
    </g>
  </g>;
}

export function LayMap({ lays, offsetPx = 5, ...props }: LayMapProps) {
  let routes;
  try {
    if (!lays.length) throw new Error('No lays');
    routes = lays.map(lay => ({ ...lay, points: routePixels(lay.route, props.viewport, lay.side, offsetPx) }));
  } catch { return <p role="status">Hose route unavailable — a pavement route is required for every lay.</p>; }
  return <MapFrame {...props} label="Road map with hose lays" caption="Hose: solid arrow lays toward the fire; hollow arrow lays away. Side is relative to travel.">
    {routes.map(lay => <RouteOverlay key={lay.id} points={lay.points} color={MAP_COLORS.hose} hollow={lay.direction === 'away-from-fire'} label={`${lay.label || lay.id}: ${lay.direction === 'toward-fire' ? 'toward fire' : 'away from fire'}, ${lay.side.toLowerCase()} side`} />)}
  </MapFrame>;
}

export default LayMap;
