'use client';

import { routePixels, assertRouteEndpoint, DUMP_SITE, FILL_HYDRANT, MAP_ROUTES, decodeRoute, latLonToPixel, type MapViewport, type RoutePolyline } from '../lib/geo';
import { MAP_COLORS } from '../lib/staticmap';
import { MapFrame, RouteOverlay, type MapProps } from './LayMap';

export type ShuttleMapProps = MapProps & {
  /** Independently routed fill → dump, in travel order. */
  loaded?: RoutePolyline;
  /** Independently routed dump → fill, in travel order; never reverse loaded. */
  empty?: RoutePolyline;
  offsetPx?: number;
};

export const SHUTTLE_VIEWPORT: MapViewport = { center: { lat: 41.159, lng: -73.4602 }, zoom: 16, width: 560, height: 470 };

export function ShuttleMap({ loaded = MAP_ROUTES.loaded, empty = MAP_ROUTES.empty, offsetPx = 3, viewport = SHUTTLE_VIEWPORT, ...props }: ShuttleMapProps) {
  let loadedPoints, emptyPoints;
  try {
    const toDump = decodeRoute(loaded), toFill = decodeRoute(empty);
    assertRouteEndpoint(toDump[0], FILL_HYDRANT); assertRouteEndpoint(toDump.at(-1)!, DUMP_SITE);
    assertRouteEndpoint(toFill[0], DUMP_SITE); assertRouteEndpoint(toFill.at(-1)!, FILL_HYDRANT);
    loadedPoints = routePixels(loaded, viewport, 'RIGHT', offsetPx);
    emptyPoints = routePixels(empty, viewport, 'RIGHT', offsetPx);
  } catch { return <p role="status">Shuttle map unavailable — separate pavement routes are required for loaded and empty legs.</p>; }
  return <MapFrame {...props} viewport={viewport} label="Road map with separately routed shuttle legs" caption="Loaded: solid teal, fill to dump. Empty: dashed grey, dump to fill. Each leg is routed separately.">
    <RouteOverlay points={emptyPoints} color={MAP_COLORS.label} hollow dashed label="Empty: dump to fill" />
    {[{ point: decodeRoute(empty)[0], label: 'DUMP' }, { point: decodeRoute(loaded)[0], label: 'FILL · 1-18' }].map(({ point, label }) => {
      const p = latLonToPixel(point, viewport);
      return <g key={label}><circle cx={p.x} cy={p.y} r={4} fill={MAP_COLORS.ink} /><text x={p.x} y={p.y - 12} textAnchor="middle" fill={MAP_COLORS.ink} fontSize={11} fontFamily="monospace">{label}</text></g>;
    })}
    <RouteOverlay points={loadedPoints} color={MAP_COLORS.loaded} label="Loaded: fill to dump" />
  </MapFrame>;
}

export default ShuttleMap;
