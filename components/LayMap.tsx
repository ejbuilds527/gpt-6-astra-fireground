import type { ReactNode } from 'react';
import {
  DRIVE_TRACE, DUMP_SITE, LAY_JUNCTION, LODGE, MAP_ROUTES,
  assertNear, autoFit, boundsCenter, distanceM, joinAtJunction, midpointBearing,
  offsetPolyline, projectToCanvas, snapToJunction, svgPath, toLatLon,
  type LatLon, type Point, type Polyline, type Side, type Viewport,
} from '../lib/geo';
import { MAP_COLORS, staticMapUrl } from '../lib/staticmap';

/** These render on the server. The Static Maps key is read from the environment
 * inside staticMapUrl and is never a prop, so no key crosses a component
 * boundary. Nothing here needs state, an effect or an event handler.
 *
 * Position is inline rather than in a class, because the overlay must sit on
 * the image whether or not a stylesheet reaches this component. */

export type MapProps = {
  viewport?: Viewport;
  className?: string;
};

export type LayMapProps = MapProps & {
  /** Junction to the Lodge, in travel order. Encoded polyline or measured trace. */
  drivePolyline?: Polyline;
  /** Junction to the dump, in travel order. */
  streetPolyline?: Polyline;
  /** Alias for drivePolyline. Two call sites named these props differently. */
  drive?: Polyline;
  /** Alias for streetPolyline. */
  street?: Polyline;
  /** Right of travel entry to the Lodge. */
  driveSide?: Side;
  /** Left of travel entry to the dump: the driveway meets Valley Rd on the left. */
  streetSide?: Side;
  /** The driveway mouth. BOTH lays start here. */
  junction?: LatLon;
  lodge?: LatLon;
  /** Where the line is dropped. No crossing is ever drawn here. Measured at the
   * driveway mouth, so it defaults to the junction and shares that marker. */
  drop?: LatLon;
  dump?: LatLon;
  /** THE ONE CROSSING. It belongs at the dump and is refused anywhere else. */
  crossing?: LatLon | null;
  /** Legibility offset in canvas pixels, not a survey measurement. */
  offsetPx?: number;
  hoseWidth?: number;
  width?: number;
  height?: number;
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** The image and the overlay share one viewport, one aspect ratio and one
 * origin. A caption states what the reader is looking at. */
export function MapFrame({
  viewport, className, children, alt, caption,
}: MapProps & { viewport: Viewport; children?: ReactNode; alt: string; caption: string }) {
  const src = staticMapUrl(viewport);
  return (
    <figure className={className} style={{ margin: 0 }}>
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${viewport.width}/${viewport.height}`,
        background: MAP_COLORS.landscape,
        border: `1px solid ${MAP_COLORS.roadStroke}`,
        borderRadius: 4,
        overflow: 'hidden',
      }}>
        {src ? (
          <img
            src={src}
            alt={alt}
            width={viewport.width}
            height={viewport.height}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
        ) : null}
        {children ? (
          <svg
            viewBox={`0 0 ${viewport.width} ${viewport.height}`}
            role="img"
            aria-label={caption}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: 'none' }}
          >
            <title>{caption}</title>
            {children}
          </svg>
        ) : null}
      </div>
      <figcaption style={{ color: MAP_COLORS.label, fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>
        {caption}
      </figcaption>
    </figure>
  );
}

/** Direction is a SHAPE, never a colour. A solid triangle lays toward the fire,
 * a hollow one lays away, each rotated to the true bearing at its own midpoint. */
export function DirectionGlyph({ points, solid, label }: { points: readonly Point[]; solid: boolean; label: string }) {
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

export function Marker({ at, label, note, anchor = 'start' }: {
  at: Point; label: string; note?: string; anchor?: 'start' | 'end';
}) {
  const dx = anchor === 'end' ? -11 : 11;
  return (
    <g>
      <circle cx={at[0]} cy={at[1]} r={4} fill={MAP_COLORS.ink} stroke={MAP_COLORS.canvas} strokeWidth={2} />
      <text x={at[0] + dx} y={at[1] - 4} textAnchor={anchor} fill={MAP_COLORS.ink} fontSize={11} fontFamily={MONO} letterSpacing="0.06em">{label}</text>
      {note ? (
        <text x={at[0] + dx} y={at[1] + 9} textAnchor={anchor} fill={MAP_COLORS.ink3} fontSize={9.5} fontFamily={MONO}>{note}</text>
      ) : null}
    </g>
  );
}

/** THE SUPPLY LAY.
 *
 * 1  A lay follows pavement. It is never a straight chord between two points.
 * 2  Both segments start at the SAME junction, the driveway mouth. Routing from
 *    the hospital circle instead sends the line through a parking lot.
 * 3  The drive lays RIGHT of travel to the Lodge. The street lays LEFT of travel
 *    to the dump, because the driveway joins the LEFT side of Valley Rd. Staying
 *    on the driveway's side is the rule: a sidewalk walked without crossing.
 * 4  ONE crossing, at the dump, dashed and ringed, reading CROSS ONCE RAMP IT.
 *    A crossing more than 30 m from the dump is refused rather than drawn.
 * 5  The two offset lays must meet within one line width at the junction.
 * 6  Orange marks hose and nothing else. No second saturated colour.
 * 7  Direction is a shape, not a colour.
 *
 * A missing or unusable polyline degrades to the plain map image. */
export function LayMap({
  drivePolyline,
  streetPolyline,
  drive: driveAlias,
  street: streetAlias,
  driveSide = 'RIGHT',
  streetSide = 'LEFT',
  junction = LAY_JUNCTION,
  lodge = LODGE,
  drop,
  dump = DUMP_SITE,
  crossing = DUMP_SITE,
  offsetPx = 6,
  hoseWidth = 5,
  width = 560,
  height = 600,
  viewport,
  className,
}: LayMapProps = {}) {
  const alt = 'Supply lay from the Lodge down the private drive and Valley Rd to the dump site';
  const driveRoute = drivePolyline ?? driveAlias ?? DRIVE_TRACE;
  const streetRoute = streetPolyline ?? streetAlias ?? MAP_ROUTES.street;

  let driveLatLon: LatLon[] | null = null;
  let streetLatLon: LatLon[] | null = null;
  try {
    driveLatLon = snapToJunction(toLatLon(driveRoute), junction);
    streetLatLon = snapToJunction(toLatLon(streetRoute), junction);
    assertNear(streetLatLon[streetLatLon.length - 1], dump);
  } catch {
    driveLatLon = null;
    streetLatLon = null;
  }

  // The line is dropped at the driveway mouth, so the drop and the junction are
  // one point unless a caller measures them apart.
  const dropPoint = drop ?? junction;
  const dropAtJunction = distanceM(dropPoint, junction) <= 5;
  const fitPoints: LatLon[] = [
    ...(driveLatLon ?? []), ...(streetLatLon ?? []),
    junction, lodge, dump, dropPoint,
  ];
  const frame: Viewport = viewport ?? {
    center: boundsCenter(fitPoints),
    zoom: autoFit(fitPoints, width, height, 17, 40),
    width,
    height,
  };

  let overlay: ReactNode = null;
  let caption = 'Basemap only. The lay is not drawn because a pavement polyline is missing.';

  if (driveLatLon && streetLatLon) {
    try {
      // Rule 4, enforced rather than described: the only crossing is at the dump.
      if (crossing && distanceM(crossing, dump) > 30) {
        throw new Error('A crossing is drawn at the dump site and nowhere else');
      }
      const project = (points: readonly LatLon[]) => projectToCanvas(points, frame.center, frame.zoom, frame.width, frame.height);
      const junctionAt = project([junction])[0];
      const sign = (side: Side) => (side === 'RIGHT' ? offsetPx : -offsetPx);
      const drive = offsetPolyline(project(driveLatLon), sign(driveSide));
      const street = offsetPolyline(project(streetLatLon), sign(streetSide));
      joinAtJunction(drive, street, junctionAt, hoseWidth);

      // ONE hose, Lodge to dump. Both lays leave the junction, so the drive is
      // reversed and the shared corner is written once.
      const hose: Point[] = [...drive].reverse().concat(street.slice(1));
      const lodgeAt = drive[drive.length - 1];
      const dumpAt = street[street.length - 1];
      const crossAt = crossing ? project([crossing])[0] : null;
      const driveFt = Math.round(
        driveLatLon.slice(1).reduce((sum, p, i) => sum + distanceM(driveLatLon![i], p), 0) * 3.28084,
      );

      caption = `Right up the drive, left down Valley Rd, one crossing at the dump. Solid glyph lays toward the fire, hollow lays away. Drive trace ${driveFt} ft.`;

      overlay = (
        <>
          <path
            d={svgPath(hose)}
            fill="none"
            stroke={MAP_COLORS.hose}
            strokeWidth={hoseWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {crossAt ? (
            <g aria-label="One crossing, at the dump site">
              <title>Cross once at the dump and ramp it</title>
              <path
                d={svgPath([dumpAt, crossAt])}
                fill="none"
                stroke={MAP_COLORS.hose}
                strokeWidth={hoseWidth}
                strokeDasharray="6 5"
                strokeLinecap="butt"
              />
              <circle cx={crossAt[0]} cy={crossAt[1]} r={13} fill="none" stroke={MAP_COLORS.ink2} strokeWidth={2} />
              <text
                x={crossAt[0] - 20}
                y={crossAt[1] - 20}
                textAnchor="end"
                fill={MAP_COLORS.ink2}
                fontSize={10.5}
                fontFamily={MONO}
                letterSpacing="0.08em"
              >CROSS ONCE · RAMP IT</text>
            </g>
          ) : null}
          <DirectionGlyph points={drive} solid label="The drive lay runs toward the fire" />
          <DirectionGlyph points={street} solid={false} label="The street lay runs away from the fire" />
          <Marker at={lodgeAt} label="THE LODGE" note="attack pump" />
          {dropAtJunction ? (
            <Marker at={junctionAt} label="DROP" note="both lays start here · no crossing" anchor="end" />
          ) : (
            <>
              <Marker at={junctionAt} label="DRIVEWAY MOUTH" note="both lays start here" anchor="end" />
              <Marker at={project([dropPoint])[0]} label="DROP" note="no crossing here" anchor="end" />
            </>
          )}
          <Marker at={dumpAt} label="DUMP" note="portable pond" />
          <Legend x={16} y={frame.height - 62} />
        </>
      );
    } catch {
      overlay = null;
      caption = 'Basemap only. The lay would have crossed the road or left the pavement, so it is not drawn.';
    }
  }

  return <MapFrame viewport={frame} className={className} alt={alt} caption={caption}>{overlay}</MapFrame>;
}

function Legend({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} aria-label="Key">
      <rect width={196} height={46} rx={3} fill={MAP_COLORS.canvas} stroke={MAP_COLORS.roadStroke} />
      <g transform="translate(18,16)">
        <path d="M-9 -6 L10 0 L-9 6 Z" fill={MAP_COLORS.ink} stroke={MAP_COLORS.ink} strokeWidth={1.5} />
      </g>
      <text x={34} y={20} fill={MAP_COLORS.ink2} fontSize={9.5} fontFamily={MONO}>LAYS TOWARD THE FIRE</text>
      <g transform="translate(18,34)">
        <path d="M-9 -6 L10 0 L-9 6 Z" fill="none" stroke={MAP_COLORS.ink} strokeWidth={1.5} />
      </g>
      <text x={34} y={38} fill={MAP_COLORS.ink2} fontSize={9.5} fontFamily={MONO}>LAYS AWAY</text>
    </g>
  );
}

export default LayMap;
