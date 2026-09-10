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
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 21) throw new Error('Invalid map zoom');
  const lng = longitude(point);
  if (!Number.isFinite(point.lat) || Math.abs(point.lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) throw new Error('Invalid map coordinates');
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
  const sin = Math.sin(latitude * Math.PI / 180);
  const size = 256 * 2 ** zoom;
  return { x: (lng + 180) / 360 * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}

export function latLonToPixel(point: LatLng, viewport: MapViewport): Pixel {
  const p = worldPixel(point, viewport.zoom), c = worldPixel(viewport.center, viewport.zoom);
  const world = 256 * 2 ** viewport.zoom;
  const dx = ((p.x - c.x + world / 2) % world + world) % world - world / 2;
  return { x: viewport.width / 2 + dx, y: viewport.height / 2 + p.y - c.y };
}

/** Right normal in SVG's downward-positive Y axis. Each vertex uses its outgoing
 * segment bearing; the terminal vertex uses the last nonzero incoming segment. */
export function offsetPolyline(points: readonly Pixel[], distance: number, side: RoadSide): Pixel[] {
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Invalid route pixels');
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
  return offsetPolyline(decodePolyline(encoded).map(p => latLonToPixel(p, viewport)), offset, side);
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

// Backwards-compatible name for existing map callers.
export const project = latLonToPixel;

export const LAY_JUNCTION: LatLng = { lat: 41.164669, lng: -73.467249 };
/** Astra satellite trace: 20 vertices, 801 ft measured / 823 ft recorded. */
export const DRIVE_VISION: readonly LatLng[] = [{"lat": 41.16466902094912, "lng": -73.46724868359377}, {"lat": 41.16476723588786, "lng": -73.46711822094727}, {"lat": 41.16490163503915, "lng": -73.46702895703126}, {"lat": 41.164999849629254, "lng": -73.46701522412108}, {"lat": 41.16510323324928, "lng": -73.46707702221681}, {"lat": 41.16517560168624, "lng": -73.46704955639649}, {"lat": 41.165180770857255, "lng": -73.46684356274413}, {"lat": 41.165227293378, "lng": -73.46668563427735}, {"lat": 41.165315169160415, "lng": -73.46660323681641}, {"lat": 41.16540821397805, "lng": -73.46661010327148}, {"lat": 41.16553227352937, "lng": -73.46652770581055}, {"lat": 41.165645994578426, "lng": -73.46649337353516}, {"lat": 41.16575971543012, "lng": -73.46654830517578}, {"lat": 41.16587343608446, "lng": -73.46664443554688}, {"lat": 41.16595614189094, "lng": -73.4667611652832}, {"lat": 41.16603367848969, "lng": -73.46683669628906}, {"lat": 41.16612672228709, "lng": -73.46689162792968}, {"lat": 41.16615256776293, "lng": -73.46700835766602}, {"lat": 41.16623527321709, "lng": -73.46709075512696}, {"lat": 41.16633865488798, "lng": -73.46704268994141}];

/** Ground metres per logical pixel; scale=2 doubles bitmap density only. */
export function metersPerPixel(latitude: number, zoom: number): number {
  return Math.cos(latitude * Math.PI / 180) * 2 * Math.PI * 6378137 / (256 * 2 ** zoom);
}

export function decodeRoute(route: RoutePolyline): LatLng[] {
  const points = decodePolyline(typeof route === 'string' ? route : route.overview_polyline.points);
  if (points.length < 3) throw new Error('A pavement overview polyline is required, not an endpoint connector');
  return points;
}

/** Snap only Directions rounding at the mouth, never reroute from the hospital circle. */
export function fromLayJunction(points: readonly LatLng[]): LatLng[] {
  if (points.length < 3) throw new Error('Pavement route missing');
  const first = worldPixel(points[0], 20), mouth = worldPixel(LAY_JUNCTION, 20);
  const errorM = Math.hypot(first.x - mouth.x, first.y - mouth.y) * metersPerPixel(LAY_JUNCTION.lat, 20);
  if (errorM > 3) throw new Error('Lay must start at the Valley Rd driveway mouth');
  return [LAY_JUNCTION, ...points.slice(1)];
}

/** Meet the two right-side offsets on their local segment lines. This is a corner
 * join, not a connector across Valley Rd. Reject a left-side or excessive miter. */
export function joinRightLays(drive: Pixel[], street: Pixel[], center: Pixel, lineWidth: number): void {
  const a = drive[0], b = street[0];
  const u = { x: a.y - center.y, y: center.x - a.x };
  const v = { x: b.y - center.y, y: center.x - b.x };
  const cross = (p: Pixel, q: Pixel) => p.x * q.y - p.y * q.x;
  const denominator = cross(u, v);
  if (Math.abs(denominator) < 1e-9) throw new Error('Cannot verify the lay junction');
  const t = cross({ x: b.x - a.x, y: b.y - a.y }, v) / denominator;
  const join = { x: a.x + t * u.x, y: a.y + t * u.y };
  const delta = { x: join.x - center.x, y: join.y - center.y };
  if (cross(u, delta) <= 0 || cross(v, delta) <= 0 || Math.hypot(delta.x, delta.y) > 4 * Math.max(Math.hypot(a.x - center.x, a.y - center.y), Math.hypot(b.x - center.x, b.y - center.y))) {
    throw new Error('Lay junction would cross Valley Rd');
  }
  drive[0] = join; street[0] = { ...join };
  assertLayJunction(drive, street, lineWidth);
}

export function assertLayJunction(drive: readonly Pixel[], street: readonly Pixel[], lineWidth: number): void {
  if (!(lineWidth > 0) || !drive.length || !street.length || Math.hypot(drive[0].x - street[0].x, drive[0].y - street[0].y) > lineWidth) {
    throw new Error('Right-side hose lays do not meet within one line width');
  }
}

/** Google Directions overview_polylines, fetched 2026-09-10. Each leg routed independently. */
export const MAP_ROUTES = {"street": "g~fzFfal_MXw@`@y@r@aAZ]`@SLGt@WfBo@vAc@l@[ZSfCkBzBcBv@u@", "empty": "odfzFvlk_Mj@}@b@q@d@}@hA}BtA{Cr@sBx@qCxAwEf@{Bv@aEJc@f@sAVm@\\y@SQ", "loaded": "{oezF`~i_MRPGP[p@y@xBKb@cAjFi@rBkBfG}@nCm@xAcAvBmA`Ce@|@_@j@_@j@"} as const;

export const DUMP_SITE: LatLng = { lat: 41.16056, lng: -73.46396 };
export const FILL_HYDRANT: LatLng = { lat: 41.1572974, lng: -73.4565588 };

export function assertRouteEndpoint(point: LatLng, expected: LatLng): void {
  const a = worldPixel(point, 20), b = worldPixel(expected, 20);
  if (Math.hypot(a.x - b.x, a.y - b.y) * metersPerPixel(expected.lat, 20) > 20) {
    throw new Error('Route does not reach its measured endpoint');
  }
}
