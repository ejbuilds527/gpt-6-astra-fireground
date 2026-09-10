'use client';

import { useState, type ReactNode } from 'react';
import { routeArrow, routePixels, assertRouteEndpoint, DUMP_SITE, svgPath, decodeRoute, fromLayJunction, DRIVE_VISION, MAP_ROUTES, LAY_JUNCTION, latLonToPixel, offsetPolyline, joinRightLays, metersPerPixel, type Pixel, type MapViewport, type RoadSide, type RoutePolyline } from '../lib/geo';
import { MAP_COLORS, staticMapUrl } from '../lib/staticmap';

export type MapProps = {
  viewport?: MapViewport;
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
export type LayMapProps = MapProps & {
  /** Optional replacement street route, in junction → dump travel order. */
  street?: RoutePolyline;
  laneWidthFt?: number;
};
export const LAY_VIEWPORT: MapViewport = { center: { lat: 41.16345, lng: -73.4656 }, zoom: 16, width: 560, height: 600 };

export function MapFrame({ viewport = LAY_VIEWPORT, apiKey, className, children, label, caption }: MapProps & { children: ReactNode; label: string; caption: string }) {
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

export function RouteOverlay({ points, color, hollow = false, dashed = false, label, strokeWidth = 3 }: { points: ReturnType<typeof routePixels>; color: string; hollow?: boolean; dashed?: boolean; label: string; strokeWidth?: number }) {
  const arrow = routeArrow(points);
  return <g aria-label={label}>
    <title>{label}</title>
    <path d={svgPath(points)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dashed ? '10 7' : undefined} />
    <g transform={`translate(${arrow.x},${arrow.y}) rotate(${arrow.angle})`}>
      {/* An opaque interior keeps the underlying route from filling the hollow arrow. */}
      <path d="M-12 -10 L14 0 L-12 10 Z" fill={hollow ? MAP_COLORS.landscape : color} stroke={color} strokeWidth={3} strokeLinejoin="round" />
    </g>
  </g>;
}

export function LayMap({ street = MAP_ROUTES.street, laneWidthFt = 12, viewport = LAY_VIEWPORT, ...props }: LayMapProps) {
  let drive: Pixel[], road: Pixel[], centerDrive: Pixel[], centerRoad: Pixel[], hoseWidth: number, laneWidth: number;
  try {
    if (!Number.isFinite(laneWidthFt) || laneWidthFt <= 5 / 12) throw new Error('Invalid lane width');
    centerDrive = fromLayJunction(DRIVE_VISION).map(p => latLonToPixel(p, viewport));
    const streetRoute = fromLayJunction(decodeRoute(street));
    assertRouteEndpoint(streetRoute.at(-1)!, DUMP_SITE);
    centerRoad = streetRoute.map(p => latLonToPixel(p, viewport));
    const resolution = metersPerPixel(LAY_JUNCTION.lat, viewport.zoom);
    hoseWidth = 0.127 / resolution; // Five inches, no minimum-pixel exaggeration.
    laneWidth = laneWidthFt * 0.3048 / resolution;
    const offset = (laneWidth - hoseWidth) / 2;
    drive = offsetPolyline(centerDrive, offset, 'RIGHT');
    road = offsetPolyline(centerRoad, offset, 'RIGHT');
    joinRightLays(drive, road, centerDrive[0], hoseWidth);
  } catch { return <p role="status">NEEDS A MEASUREMENT — lay must follow pavement from the Valley Rd mouth without crossing the road.</p>; }
  const hose = [...drive].reverse().concat(road.slice(1));
  return <MapFrame {...props} viewport={viewport} label="Supply lay from the Lodge along the private drive and Valley Rd to the dump site" caption="Right on both segments · Valley Rd stays open. Solid arrow: toward fire. Hollow arrow: away. Drive trace: 801 ft; department record: 823 ft.">
    {/* The lane and hose share one physical scale, including at the private drive. */}
    {[centerDrive, centerRoad].map((points, i) => <path key={i} d={svgPath(points)} fill="none" stroke={MAP_COLORS.road} strokeWidth={laneWidth} strokeLinejoin="round" />)}
    <path data-hose-width={hoseWidth} data-junction-gap="0" d={svgPath(hose)} fill="none" stroke={MAP_COLORS.hose} strokeWidth={hoseWidth} strokeLinejoin="round" strokeLinecap="round" />
    {[drive, road].map((points, i) => {
      const arrow = routeArrow(points);
      return <g key={i} transform={`translate(${arrow.x},${arrow.y}) rotate(${arrow.angle})`} aria-label={i ? 'Lay away from fire' : 'Lay toward fire'}>
        <path d="M-9 -6 L9 0 L-9 6 Z" fill={i ? MAP_COLORS.landscape : MAP_COLORS.ink} stroke={MAP_COLORS.ink} strokeWidth={1.5} />
      </g>;
    })}
    {[[drive.at(-1)!, 'LODGE'], [road.at(-1)!, 'DUMP'], [centerDrive[0], 'VALLEY RD MOUTH']].map(([point, label]) => {
      const p = point as Pixel;
      return <g key={String(label)}><circle cx={p.x} cy={p.y} r={3} fill={MAP_COLORS.ink} /><text x={p.x + 9} y={p.y - 9} fill={MAP_COLORS.ink} fontSize={10} fontFamily="monospace">{String(label)}</text></g>;
    })}
    <g transform={`translate(20,${viewport.height - 105})`} aria-label={`Lane cross-section: five inch hose against ${laneWidthFt} foot lane`}>
      <rect width={260} height={70} fill={MAP_COLORS.landscape} />
      <text x={10} y={17} fill={MAP_COLORS.label} fontSize={10}>LANE CROSS-SECTION · {laneWidthFt} FT</text>
      <rect x={10} y={29} width={230} height={15} fill={MAP_COLORS.road} stroke={MAP_COLORS.roadStroke} />
      <rect x={240 - 230 * (5 / 12) / laneWidthFt} y={29} width={230 * (5 / 12) / laneWidthFt} height={15} fill={MAP_COLORS.hose} />
      <text x={10} y={60} fill={MAP_COLORS.label} fontSize={10}>TRAVEL LANE OPEN</text>
      <text x={240} y={60} textAnchor="end" fill={MAP_COLORS.ink} fontSize={10}>5 IN HOSE</text>
    </g>
  </MapFrame>;
}

export default LayMap;
