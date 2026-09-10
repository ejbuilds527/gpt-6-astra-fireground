/** Logical map pixels: scale=2 changes image resolution, never these coordinates. */
export type LatLng = { lat: number; lng: number } | { lat: number; lon: number };
export type Pixel = { x: number; y: number };
export type MapViewport = { center: LatLng; zoom: number; width: number; height: number };
export type DirectionsRoute = { overview_polyline: { points: string } };
export type RoutePolyline = string | DirectionsRoute;
export type RoadSide = 'LEFT' | 'RIGHT';

export function decodePolyline(encoded: string): LatLng[] {
  let index = 0, lat = 0, lng = 0;
  const read = () => {
    let value = 0, shift = 0, byte: number;
    do {
      if (index >= encoded.length || shift > 30) throw new Error('Invalid route polyline');
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error('Invalid route polyline');
      value += (byte & 31) * 2 ** shift;
      shift += 5;
    } while (byte >= 32);
    return value % 2 ? -(value + 1) / 2 : value / 2;
  };
  const result: LatLng[] = [];
  while (index < encoded.length) {
    lat += read(); lng += read();
    if (Math.abs(lat) > 9e6 || Math.abs(lng) > 18e6) throw new Error('Route coordinates out of range');
    result.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return result;
}

export function longitude(point: LatLng): number {
  return 'lng' in point ? point.lng : point.lon;
}

export function worldPixel(point: LatLng, zoom: number): Pixel {
  const lng = longitude(point);
  if (!Number.isFinite(point.lat) || Math.abs(point.lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) throw new Error('Invalid map coordinates');
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
  const sin = Math.sin(latitude * Math.PI / 180);
  const size = 256 * 2 ** zoom;
  return { x: (lng + 180) / 360 * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

export function project(point: LatLng, viewport: MapViewport): Pixel {
  const p = worldPixel(point, viewport.zoom), c = worldPixel(viewport.center, viewport.zoom);
  const world = 256 * 2 ** viewport.zoom;
  const dx = ((p.x - c.x + world / 2) % world + world) % world - world / 2;
  return { x: viewport.width / 2 + dx, y: viewport.height / 2 + p.y - c.y };
}

/** Right normal in SVG's downward-positive Y axis. Each vertex uses its outgoing
 * segment bearing; the terminal vertex uses the last nonzero incoming segment. */
export function offsetPolyline(points: readonly Pixel[], distance: number, side: RoadSide): Pixel[] {
  if (!Number.isFinite(distance) || distance < 0) throw new Error('Invalid road offset');
  const clean = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  if (clean.length < 2) throw new Error('Route needs two distinct vertices');
  const signed = side === 'RIGHT' ? distance : -distance;
  return clean.map((p, i) => {
    const a = clean[Math.min(i, clean.length - 2)], b = clean[Math.min(i + 1, clean.length - 1)];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    return { x: p.x - dy / length * signed, y: p.y + dx / length * signed };
  });
}

export function routePixels(route: RoutePolyline, viewport: MapViewport, side: RoadSide = 'RIGHT', offset = 5): Pixel[] {
  const encoded = typeof route === 'string' ? route : route.overview_polyline.points;
  return offsetPolyline(decodePolyline(encoded).map(p => project(p, viewport)), offset, side);
}

export function svgPath(points: readonly Pixel[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

/** Place direction on a real segment, halfway along the route's screen length. */
export function routeArrow(points: readonly Pixel[]): Pixel & { angle: number } {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i];
    if (length > 0 && remaining <= length) {
      const a = points[i], b = points[i + 1], t = remaining / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
    }
    remaining -= length;
  }
  throw new Error('Route needs two distinct vertices');
}
