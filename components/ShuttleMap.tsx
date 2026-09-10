'use client';

import { routePixels, type RoadSide, type RoutePolyline } from '../lib/geo';
import { MAP_COLORS } from '../lib/staticmap';
import { MapFrame, RouteOverlay, type MapProps } from './LayMap';

export type ShuttleMapProps = MapProps & {
  /** Independently routed fill → dump, in travel order. */
  loaded: RoutePolyline;
  /** Independently routed dump → fill, in travel order; never reverse loaded. */
  empty: RoutePolyline;
  loadedSide?: RoadSide;
  emptySide?: RoadSide;
  offsetPx?: number;
};

export function ShuttleMap({ loaded, empty, loadedSide = 'RIGHT', emptySide = 'RIGHT', offsetPx = 5, ...props }: ShuttleMapProps) {
  let loadedPoints, emptyPoints;
  try {
    loadedPoints = routePixels(loaded, props.viewport, loadedSide, offsetPx);
    emptyPoints = routePixels(empty, props.viewport, emptySide, offsetPx);
  } catch { return <p role="status">Shuttle map unavailable — separate pavement routes are required for loaded and empty legs.</p>; }
  return <MapFrame {...props} label="Road map with separately routed shuttle legs" caption="Loaded: solid teal, fill to dump. Empty: dashed grey, dump to fill. Each leg is routed separately.">
    <RouteOverlay points={emptyPoints} color={MAP_COLORS.label} hollow dashed label="Empty: dump to fill" />
    <RouteOverlay points={loadedPoints} color={MAP_COLORS.loaded} label="Loaded: fill to dump" />
  </MapFrame>;
}

export default ShuttleMap;
