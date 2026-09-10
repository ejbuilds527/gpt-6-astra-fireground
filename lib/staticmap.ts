/** KNOWN LIMITATION, accepted 2026-09-10 for the submission deadline.
 * A Static Maps image IS a keyed URL, so the key reaches the browser in the
 * rendered img src even though it is read server-side and is never a prop.
 * Closing it needs a route handler that streams the bytes. Until then the key
 * is restricted at the Google console. */

import { latLonToPixel, type LatLon, type Viewport } from './geo';

/** The panel palette. The basemap is styled to these values so the overlay and
 * the image read as one surface rather than a drawing pasted onto a map. */
export const MAP_COLORS = {
  canvas: '#1c1f25',
  landscape: '#23272e',
  water: '#1a1d22',
  road: '#333b43',
  roadStroke: '#3f4852',
  label: '#8f9aa4',
  labelStroke: '#1c1f25',
  ink: '#e6ebef',
  ink2: '#a8b3bd',
  ink3: '#6e7a85',
  /** The one saturated colour on the lay surface. It marks hose and nothing else. */
  hose: '#EF8200',
} as const;

/** THE KEY IS SERVER-SIDE ONLY.
 *
 * Next inlines an environment variable into the client bundle only when it is
 * named NEXT_PUBLIC_*. MAPS_API_KEY is not, so this reads `undefined` in the
 * browser and every caller below degrades instead of building a keyed URL. That
 * is the guard: a client component cannot accidentally mint one.
 *
 * The residual is worth stating plainly. A Static Maps image IS a keyed URL, so
 * building it in a server component still puts the key in the rendered <img
 * src>. Restrict the key by HTTP referrer, or proxy the bytes through a route
 * handler that calls staticMapUrl and streams the response. */
export function mapsApiKey(): string | null {
  const key = process.env.MAPS_API_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

export type StaticMapOptions = { scale?: 1 | 2 };

/** Build the Static Maps URL for a viewport, or null when no key is available.
 * The SAME viewport must drive the SVG projection, or the overlay slides off
 * the pavement. */
export function staticMapUrl(viewport: Viewport, { scale = 2 }: StaticMapOptions = {}): string | null {
  const key = mapsApiKey();
  if (!key) return null;
  const { center, zoom, width, height } = viewport;
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 21) throw new Error('Static map zoom must be a whole number from 0 to 21');
  if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= 640)) throw new Error('Static map size must be 1 to 640 logical pixels');
  if (scale !== 1 && scale !== 2) throw new Error('Static map scale must be 1 or 2');
  latLonToPixel(center[0], center[1], zoom);
  const params = new URLSearchParams({
    center: `${center[0]},${center[1]}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    scale: String(scale),
    maptype: 'roadmap',
    format: 'png',
    key,
  });
  for (const style of mapStyle()) params.append('style', style);
  return `https://maps.googleapis.com/maps/api/staticmap?${params}`;
}

/** The basemap carries pavement and street names. Everything else is removed,
 * because every mark left on the map competes with the hose. */
export function mapStyle(): string[] {
  const hex = (color: string) => color.replace('#', '0x');
  return [
    'feature:poi|visibility:off',
    'feature:transit|visibility:off',
    'feature:administrative|element:labels|visibility:off',
    'element:labels.icon|visibility:off',
    `feature:landscape|element:geometry|color:${hex(MAP_COLORS.landscape)}`,
    `feature:water|element:geometry|color:${hex(MAP_COLORS.water)}`,
    `feature:road|element:geometry.fill|color:${hex(MAP_COLORS.road)}`,
    `feature:road|element:geometry.stroke|color:${hex(MAP_COLORS.roadStroke)}`,
    `feature:road|element:labels.text.fill|color:${hex(MAP_COLORS.label)}`,
    `feature:road|element:labels.text.stroke|color:${hex(MAP_COLORS.labelStroke)}`,
  ];
}

/** Fit a viewport to the points a surface must show. */
export function viewportFor(center: LatLon, zoom: number, width: number, height: number): Viewport {
  return { center, zoom, width, height };
}
