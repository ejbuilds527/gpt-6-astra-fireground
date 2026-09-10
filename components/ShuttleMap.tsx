import type { ReactNode } from 'react';
import {
  DUMP_SITE, FILL_HYDRANT, MAP_ROUTES,
  assertNear, autoFit, boundsCenter, midpointBearing, offsetPolyline,
  projectToCanvas, svgPath, toLatLon,
  type LatLon, type Point, type Polyline, type Viewport,
} from '../lib/geo';
import { MAP_COLORS } from '../lib/staticmap';
import { MapFrame, type MapProps } from './LayMap';

/** THE TANKER LOOP.
 *
 * The cycle is travel OUT, fill, travel BACK, dump, which is how lib/shuttle.ts
 * and the incident record already name it. So `out` runs dump to fill with the
 * tanker EMPTY, and `back` runs fill to dump with the tanker LOADED. The
 * `loaded` and `empty` props name the same two legs and say plainly which one
 * carries water; either pair may be used.
 *
 * Both legs are ROUTED SEPARATELY and are never assumed equal: one-way streets,
 * turn restrictions and a loaded tanker's turning circle all make the return a
 * different road. The endpoints are asserted, so a caller that swaps the two
 * props gets a visible degrade rather than a map that lies about which leg
 * carries water. */

export type ShuttleMapProps = MapProps & {
  /** Dump to fill, in travel order. The EMPTY leg. */
  outPolyline?: Polyline;
  /** Fill to dump, in travel order. The LOADED leg. Never the reverse of out. */
  backPolyline?: Polyline;
  /** Minutes on the empty leg. */
  outMin?: number;
  /** Minutes on the loaded leg. */
  backMin?: number;
  /** Alias for backPolyline, the leg carrying water. */
  loaded?: Polyline;
  /** Alias for outPolyline. */
  empty?: Polyline;
  loadedMin?: number;
  emptyMin?: number;
  dump?: LatLon;
  fill?: LatLon;
  offsetPx?: number;
  width?: number;
  height?: number;
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const minutes = (value: number | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? `${value.toFixed(1)} min` : 'NOT ROUTED';

export function ShuttleMap({
  outPolyline, backPolyline, empty: emptyAlias, loaded: loadedAlias,
  outMin, backMin, emptyMin, loadedMin,
  dump = DUMP_SITE,
  fill = FILL_HYDRANT,
  offsetPx = 5.5,
  width = 560,
  height = 520,
  viewport,
  className,
}: ShuttleMapProps = {}) {
  const alt = 'Road map of the tanker shuttle between the dump site and the fill site';
  const emptyRoute = outPolyline ?? emptyAlias ?? MAP_ROUTES.empty;
  const loadedRoute = backPolyline ?? loadedAlias ?? MAP_ROUTES.loaded;
  const emptyTime = outMin ?? emptyMin;
  const loadedTime = backMin ?? loadedMin;

  let empty: LatLon[] | null = null;
  let loaded: LatLon[] | null = null;
  try {
    empty = toLatLon(emptyRoute);
    loaded = toLatLon(loadedRoute);
    if (empty.length < 3 || loaded.length < 3) throw new Error('A shuttle leg needs a pavement polyline');
    assertNear(empty[0], dump);
    assertNear(empty[empty.length - 1], fill);
    assertNear(loaded[0], fill);
    assertNear(loaded[loaded.length - 1], dump);
  } catch {
    empty = null;
    loaded = null;
  }

  const fitPoints: LatLon[] = [...(empty ?? []), ...(loaded ?? []), dump, fill];
  const frame: Viewport = viewport ?? {
    center: boundsCenter(fitPoints),
    zoom: autoFit(fitPoints, width, height, 17, 46),
    width,
    height,
  };

  let overlay: ReactNode = null;
  let caption = 'Basemap only. A shuttle leg is not drawn because its polyline is missing or does not reach the measured endpoints.';

  if (empty && loaded) {
    const project = (points: readonly LatLon[]) => projectToCanvas(points, frame.center, frame.zoom, frame.width, frame.height);
    // Each leg is offset right of ITS OWN travel. The two legs run in opposite
    // directions, so one positive offset puts them on opposite sides of shared
    // pavement. Opposite signs would stack them on the same side.
    const emptyPts = offsetPolyline(project(empty), offsetPx);
    const loadedPts = offsetPolyline(project(loaded), offsetPx);
    const dumpAt = project([dump])[0];
    const fillAt = project([fill])[0];
    caption = `Loaded ${minutes(loadedTime)} solid, empty ${minutes(emptyTime)} dashed. Each leg is routed separately, so the two times are not assumed equal.`;

    overlay = (
      <>
        <path
          d={svgPath(emptyPts)}
          fill="none"
          stroke={MAP_COLORS.label}
          strokeWidth={5}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray="10 7"
        />
        <path
          d={svgPath(loadedPts)}
          fill="none"
          stroke={MAP_COLORS.ink2}
          strokeWidth={5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Glyph points={loadedPts} solid label="Loaded, running to the dump" />
        <Glyph points={emptyPts} solid={false} label="Empty, running to the fill site" />
        <Leader at={dumpAt} toward="left" label="DUMP" note="portable pond" />
        <Leader at={fillAt} toward="right" label="FILL · 1-18" note="hydrant" />
        <g transform="translate(16,16)">
          <rect width={218} height={44} rx={3} fill={MAP_COLORS.canvas} stroke={MAP_COLORS.roadStroke} />
          <rect x={11} y={13} width={22} height={4} fill={MAP_COLORS.ink2} />
          <text x={41} y={20} fill={MAP_COLORS.ink} fontSize={10.5} fontFamily={MONO}>LOADED · {minutes(loadedTime)}</text>
          <rect x={11} y={29} width={9} height={4} fill={MAP_COLORS.label} />
          <rect x={24} y={29} width={9} height={4} fill={MAP_COLORS.label} />
          <text x={41} y={36} fill={MAP_COLORS.ink2} fontSize={10.5} fontFamily={MONO}>EMPTY · {minutes(emptyTime)}</text>
        </g>
      </>
    );
  }

  return <MapFrame viewport={frame} className={className} alt={alt} caption={caption}>{overlay}</MapFrame>;
}

function Glyph({ points, solid, label }: { points: readonly Point[]; solid: boolean; label: string }) {
  const at = midpointBearing(points);
  return (
    <g transform={`translate(${at.x.toFixed(2)},${at.y.toFixed(2)}) rotate(${at.angle.toFixed(1)})`} aria-label={label}>
      <title>{label}</title>
      <path
        d="M-10 -7 L11 0 L-10 7 Z"
        fill={solid ? MAP_COLORS.ink : MAP_COLORS.landscape}
        stroke={MAP_COLORS.ink}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </g>
  );
}

/** A hairline leader carries the label off the route so neither hides the other. */
function Leader({ at, toward, label, note }: {
  at: Point; toward: 'left' | 'right'; label: string; note: string;
}) {
  const direction = toward === 'left' ? -1 : 1;
  const elbow: Point = [at[0] + direction * 18, at[1] - 18];
  const end: Point = [elbow[0] + direction * 22, elbow[1]];
  const anchor = toward === 'left' ? 'end' : 'start';
  return (
    <g>
      <path d={svgPath([at, elbow, end])} fill="none" stroke={MAP_COLORS.ink3} strokeWidth={1} />
      <circle cx={at[0]} cy={at[1]} r={4.5} fill={MAP_COLORS.ink} stroke={MAP_COLORS.canvas} strokeWidth={2} />
      <text x={end[0] + direction * 4} y={end[1] - 1} textAnchor={anchor} fill={MAP_COLORS.ink} fontSize={11} fontFamily={MONO} letterSpacing="0.06em">{label}</text>
      <text x={end[0] + direction * 4} y={end[1] + 12} textAnchor={anchor} fill={MAP_COLORS.ink3} fontSize={9.5} fontFamily={MONO}>{note}</text>
    </g>
  );
}

export default ShuttleMap;
