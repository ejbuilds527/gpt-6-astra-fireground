/** Fireground map maths. Pure functions. No React, no DOM, no network.
 *
 * TWO COORDINATE SPACES, AND THEY ARE NEVER MIXED.
 *   LatLon  [latitude, longitude] in degrees.
 *   Point   [x, y] in canvas pixels, y INCREASING DOWNWARD, the way SVG measures.
 *
 * Every screen-space rule in this file is stated in the y-down space. Right of
 * travel is (-dy, dx) normalised there. A caller that reasons about sides in
 * lat/lon gets the opposite answer, because latitude increases upward. Project
 * first, then ask about sides.
 */

export type LatLon = [lat: number, lon: number];
export type Point = [x: number, y: number];
export type Side = 'LEFT' | 'RIGHT';
export type Pixel = { x: number; y: number };
export type Viewport = { center: LatLon; zoom: number; width: number; height: number };
/** A Google encoded overview polyline, or an already-decoded trace. */
export type Polyline = string | readonly LatLon[];

const TILE = 256;
const MAX_LAT = 85.05112878;
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6378137;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Google's encoded polyline algorithm. Returns [lat, lon] degrees.
 * The value accumulates arithmetically rather than with bitwise OR, because a
 * bitwise shift past 30 truncates to 32 bits and silently corrupts the point. */
export function decodePolyline(encoded: string): LatLon[] {
  if (typeof encoded !== 'string') throw new Error('Encoded polyline must be a string');
  let index = 0;
  let lat = 0;
  let lon = 0;
  const points: LatLon[] = [];
  const read = (): number => {
    let value = 0;
    let shift = 0;
    let byte = 0;
    do {
      if (index >= encoded.length || shift > 30) throw new Error('Invalid encoded polyline');
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error('Invalid encoded polyline');
      value += (byte & 31) * 2 ** shift;
      shift += 5;
    } while (byte >= 32);
    return value % 2 ? -(value + 1) / 2 : value / 2;
  };
  while (index < encoded.length) {
    lat += read();
    lon += read();
    if (Math.abs(lat) > 9e6 || Math.abs(lon) > 18e6) throw new Error('Decoded polyline leaves the earth');
    points.push([lat / 1e5, lon / 1e5]);
  }
  return points;
}

/** Accept either an encoded polyline or a decoded trace. */
export function toLatLon(polyline: Polyline): LatLon[] {
  if (typeof polyline === 'string') return decodePolyline(polyline);
  if (!Array.isArray(polyline)) throw new Error('Polyline must be a string or an array of points');
  return polyline.map(([lat, lon]) => {
    if (!isFiniteNumber(lat) || Math.abs(lat) > 90) throw new Error('Invalid latitude');
    if (!isFiniteNumber(lon) || Math.abs(lon) > 180) throw new Error('Invalid longitude');
    return [lat, lon] as LatLon;
  });
}

/** Web Mercator world pixel at 256 px tiles. Zoom may be fractional here; the
 * Static Maps API takes an integer, and staticMapUrl enforces that separately. */
export function latLonToPixel(lat: number, lon: number, zoom: number): Pixel {
  if (!isFiniteNumber(lat) || Math.abs(lat) > 90) throw new Error('Invalid latitude');
  if (!isFiniteNumber(lon) || Math.abs(lon) > 180) throw new Error('Invalid longitude');
  if (!isFiniteNumber(zoom) || zoom < 0 || zoom > 22) throw new Error('Invalid map zoom');
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  const size = TILE * 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** World pixels to canvas pixels about a centre. The x wrap keeps a route that
 * straddles the antimeridian from projecting a world-width away. */
export function projectToCanvas(
  points: readonly LatLon[],
  center: LatLon,
  zoom: number,
  width: number,
  height: number,
): Point[] {
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) {
    throw new Error('Canvas size must be positive');
  }
  const origin = latLonToPixel(center[0], center[1], zoom);
  const world = TILE * 2 ** zoom;
  return points.map(([lat, lon]) => {
    const p = latLonToPixel(lat, lon, zoom);
    const dx = ((((p.x - origin.x + world / 2) % world) + world) % world) - world / 2;
    return [width / 2 + dx, height / 2 + (p.y - origin.y)] as Point;
  });
}

/** Offset every vertex perpendicular to ITS OWN segment bearing.
 * A POSITIVE px offsets RIGHT of travel, negative offsets LEFT. Right of travel
 * in this y-down space is (-dy, dx) normalised. Each vertex takes its OUTGOING
 * segment; the terminal vertex takes the last segment it has. */
export function offsetPolyline(canvasPts: readonly Point[], px: number): Point[] {
  if (!isFiniteNumber(px)) throw new Error('Invalid offset');
  const clean = dedupe(canvasPts);
  if (clean.length < 2) throw new Error('An offset needs two distinct vertices');
  return clean.map((p, i) => {
    const from = clean[Math.min(i, clean.length - 2)];
    const to = clean[Math.min(i + 1, clean.length - 1)];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    return [p[0] - (dy / length) * px, p[1] + (dx / length) * px] as Point;
  });
}

/** Which side of the polyline the point lies on, from the sign of the 2D cross
 * product at the NEAREST segment. Screen space, y down: a positive cross puts
 * the point right of travel. A point exactly on the line reports RIGHT. */
export function sideOfLine(polyline: readonly Point[], point: Point): Side {
  const clean = dedupe(polyline);
  if (clean.length < 2) throw new Error('A side test needs two distinct vertices');
  if (!isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) throw new Error('Invalid test point');
  let best = Number.POSITIVE_INFINITY;
  let cross = 0;
  for (let i = 0; i < clean.length - 1; i++) {
    const a = clean[i];
    const b = clean[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq));
    const distance = Math.hypot(a[0] + t * dx - point[0], a[1] + t * dy - point[1]);
    if (distance < best) {
      best = distance;
      cross = dx * (point[1] - a[1]) - dy * (point[0] - a[0]);
    }
  }
  return cross >= 0 ? 'RIGHT' : 'LEFT';
}

/** The largest INTEGER zoom at which every point fits the canvas with a margin.
 * Static Maps takes integer zoom only, so a fractional answer is not useful. */
export function autoFit(
  points: readonly LatLon[],
  width: number,
  height: number,
  maxZoom: number,
  marginPx = 24,
): number {
  if (!points.length) throw new Error('Auto-fit needs at least one point');
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0) {
    throw new Error('Canvas size must be positive');
  }
  const top = Math.min(21, Math.floor(maxZoom));
  if (!Number.isFinite(top) || top < 0) throw new Error('Invalid maximum zoom');
  const usableW = width - 2 * marginPx;
  const usableH = height - 2 * marginPx;
  if (usableW <= 0 || usableH <= 0) throw new Error('Margin leaves no canvas');
  for (let zoom = top; zoom > 0; zoom--) {
    const projected = points.map(([lat, lon]) => latLonToPixel(lat, lon, zoom));
    const spanX = Math.max(...projected.map(p => p.x)) - Math.min(...projected.map(p => p.x));
    const spanY = Math.max(...projected.map(p => p.y)) - Math.min(...projected.map(p => p.y));
    if (spanX <= usableW && spanY <= usableH) return zoom;
  }
  return 0;
}

/** The centre of the bounding box, for the viewport autoFit sizes. */
export function boundsCenter(points: readonly LatLon[]): LatLon {
  if (!points.length) throw new Error('A centre needs at least one point');
  const lats = points.map(p => p[0]);
  const lons = points.map(p => p[1]);
  return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
}

/** Ground metres per logical pixel. Static Maps scale=2 doubles bitmap density
 * only, so it never enters this number. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (Math.cos((lat * Math.PI) / 180) * EARTH_CIRCUMFERENCE_M) / (TILE * 2 ** zoom);
}

/** Great-circle distance in metres. */
export function distanceM(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toRad;
  const dLon = (b[1] - a[1]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLon / 2) ** 2;
  return 6378137 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function svgPath(points: readonly Point[]): string {
  if (points.length < 2) throw new Error('A path needs two vertices');
  return points.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
}

/** The point halfway along the route BY SCREEN LENGTH, and the true bearing of
 * the segment it lands on. A direction glyph is placed here, so it must sit on
 * real pavement rather than at the average of the endpoints. */
export function midpointBearing(points: readonly Point[]): { x: number; y: number; angle: number } {
  const clean = dedupe(points);
  if (clean.length < 2) throw new Error('A bearing needs two distinct vertices');
  const lengths = clean.slice(1).map((p, i) => Math.hypot(p[0] - clean[i][0], p[1] - clean[i][1]));
  let remaining = lengths.reduce((sum, n) => sum + n, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const a = clean[i];
      const b = clean[i + 1];
      const t = remaining / lengths[i];
      return {
        x: a[0] + (b[0] - a[0]) * t,
        y: a[1] + (b[1] - a[1]) * t,
        angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
      };
    }
    remaining -= lengths[i];
  }
  const last = clean[clean.length - 1];
  return { x: last[0], y: last[1], angle: 0 };
}

function dedupe(points: readonly Point[]): Point[] {
  const clean: Point[] = [];
  for (const p of points) {
    if (!isFiniteNumber(p?.[0]) || !isFiniteNumber(p?.[1])) throw new Error('Invalid canvas point');
    const previous = clean[clean.length - 1];
    if (!previous || previous[0] !== p[0] || previous[1] !== p[1]) clean.push([p[0], p[1]]);
  }
  return clean;
}

// ---------------------------------------------------------------------------
// The lay junction. Rules 2 and 5 of the supply-lay brief live here.
// ---------------------------------------------------------------------------

/** The driveway mouth on Valley Rd. Both lay segments start HERE. Routing a lay
 * from the hospital circle instead sends the line through a parking lot. */
export const LAY_JUNCTION: LatLon = [41.164669, -73.467249];

/** Astra satellite trace of the private drive, junction to the Lodge.
 * 20 vertices, 801 ft measured against a 823 ft department record. */
export const DRIVE_TRACE: readonly LatLon[] = [
  [41.16466902094912, -73.46724868359377], [41.16476723588786, -73.46711822094727],
  [41.16490163503915, -73.46702895703126], [41.164999849629254, -73.46701522412108],
  [41.16510323324928, -73.46707702221681], [41.16517560168624, -73.46704955639649],
  [41.165180770857255, -73.46684356274413], [41.165227293378, -73.46668563427735],
  [41.165315169160415, -73.46660323681641], [41.16540821397805, -73.46661010327148],
  [41.16553227352937, -73.46652770581055], [41.165645994578426, -73.46649337353516],
  [41.16575971543012, -73.46654830517578], [41.16587343608446, -73.46664443554688],
  [41.16595614189094, -73.4667611652832], [41.16603367848969, -73.46683669628906],
  [41.16612672228709, -73.46689162792968], [41.16615256776293, -73.46700835766602],
  [41.16623527321709, -73.46709075512696], [41.16633865488798, -73.46704268994141],
];

/** Google Directions overview polylines, fetched 2026-09-10, each leg routed
 * independently. `empty` runs dump to fill, `loaded` runs fill to dump. */
export const MAP_ROUTES = {
  street: 'g~fzFfal_MXw@`@y@r@aAZ]`@SLGt@WfBo@vAc@l@[ZSfCkBzBcBv@u@',
  empty: 'odfzFvlk_Mj@}@b@q@d@}@hA}BtA{Cr@sBx@qCxAwEf@{Bv@aEJc@f@sAVm@\\y@SQ',
  loaded: '{oezF`~i_MRPGP[p@y@xBKb@cAjFi@rBkBfG}@nCm@xAcAvBmA`Ce@|@_@j@_@j@',
} as const;

/** The Lodge is the last vertex of the measured drive trace. */
export const LODGE: LatLon = DRIVE_TRACE[DRIVE_TRACE.length - 1];
export const DUMP_SITE: LatLon = [41.16056, -73.46396];
export const FILL_HYDRANT: LatLon = [41.1572974, -73.4565588];

/** Snap Directions rounding at the mouth. This moves the first vertex by a few
 * metres and NEVER reroutes: a route that starts somewhere else is refused. */
export function snapToJunction(points: readonly LatLon[], junction: LatLon = LAY_JUNCTION, toleranceM = 25): LatLon[] {
  if (points.length < 2) throw new Error('A lay needs a pavement polyline, not an endpoint');
  if (distanceM(points[0], junction) > toleranceM) {
    throw new Error('A lay must start at the driveway mouth');
  }
  return [junction, ...points.slice(1)];
}

/** Assert a point is where it was measured to be. */
export function assertNear(point: LatLon, expected: LatLon, toleranceM = 25): void {
  if (distanceM(point, expected) > toleranceM) {
    throw new Error('A route does not reach its measured endpoint');
  }
}

/** Miter the two offset lays onto one corner at the shared junction, then check
 * the corner did not land on the far side of the road.
 *
 * The two lays leave the junction on different bearings, so equal offsets put
 * their first vertices `offset` apart. Both are moved to where their own offset
 * LINES meet, which is the corner a hose actually turns. Mutates in place. */
export function joinAtJunction(a: Point[], b: Point[], junction: Point, lineWidth: number): void {
  if (a.length < 2 || b.length < 2) throw new Error('Both lays need two vertices to join');
  const dirA: Point = [a[1][0] - a[0][0], a[1][1] - a[0][1]];
  const dirB: Point = [b[1][0] - b[0][0], b[1][1] - b[0][1]];
  const cross = (p: Point, q: Point) => p[0] * q[1] - p[1] * q[0];
  const denominator = cross(dirA, dirB);
  const reach = Math.max(
    Math.hypot(a[0][0] - junction[0], a[0][1] - junction[1]),
    Math.hypot(b[0][0] - junction[0], b[0][1] - junction[1]),
  );
  let join: Point;
  const t = Math.abs(denominator) < 1e-9
    ? Number.NaN
    : cross([b[0][0] - a[0][0], b[0][1] - a[0][1]], dirB) / denominator;
  const mitered: Point = [a[0][0] + t * dirA[0], a[0][1] + t * dirA[1]];
  const miterReach = Math.hypot(mitered[0] - junction[0], mitered[1] - junction[1]);
  if (Number.isFinite(t) && miterReach <= 4 * reach + lineWidth) {
    join = mitered;
  } else {
    // Near-parallel roads, or a miter spike. The corner midpoint still meets.
    join = [(a[0][0] + b[0][0]) / 2, (a[0][1] + b[0][1]) / 2];
  }
  // The corner must stay on the offset side of BOTH lays. A negative dot means
  // the hose turned across the carriageway instead of around the corner.
  for (const line of [a, b]) {
    const normal: Point = [line[0][0] - junction[0], line[0][1] - junction[1]];
    if (normal[0] * (join[0] - junction[0]) + normal[1] * (join[1] - junction[1]) < 0) {
      throw new Error('The lay junction would cross the road');
    }
  }
  a[0] = [join[0], join[1]];
  b[0] = [join[0], join[1]];
  assertJunction(a, b, lineWidth);
}

/** Rule 5. The two offset lays must meet within about one line width. */
export function assertJunction(a: readonly Point[], b: readonly Point[], lineWidth: number): void {
  if (!(lineWidth > 0) || !a.length || !b.length) throw new Error('Cannot check the lay junction');
  if (Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]) > lineWidth) {
    throw new Error('The two lays do not meet at the junction');
  }
}
