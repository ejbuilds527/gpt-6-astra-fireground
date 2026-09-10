import {
  toLatLon, projectToCanvas, offsetPolyline, svgPath, midpointBearing,
  autoFit, boundsCenter, type LatLon, type Polyline,
} from '../lib/geo';
import { staticMapUrl, viewportFor } from '../lib/staticmap';

type Props = {
  drive: Polyline;          // driveway mouth -> the structure
  street: Polyline;         // driveway mouth -> the dump site
  lodge: LatLon;
  junction: LatLon;
  dump: LatLon;
  driveSide?: 'LEFT' | 'RIGHT';
  streetSide?: 'LEFT' | 'RIGHT';
  crossingAtDump?: boolean;
  width?: number;
  height?: number;
};

const OFFSET_PX = 6;

export default function LayMap({
  drive, street, lodge, junction, dump,
  driveSide = 'RIGHT', streetSide = 'LEFT', crossingAtDump = true,
  width = 560, height = 600,
}: Props) {
  const d = toLatLon(drive);
  const s = toLatLon(street);
  const all = [...d, ...s];
  if (all.length < 2) return null;

  const center = boundsCenter(all);
  const zoom = autoFit(all, width, height, 18);
  const vp = viewportFor(center, zoom, width, height);
  const url = staticMapUrl(vp);

  const dPx = projectToCanvas(d, center, zoom, width, height);
  const sPx = projectToCanvas(s, center, zoom, width, height);
  const dLay = offsetPolyline(dPx, driveSide === 'RIGHT' ? OFFSET_PX : -OFFSET_PX);
  const sLay = offsetPolyline(sPx, streetSide === 'RIGHT' ? OFFSET_PX : -OFFSET_PX);
  const dA = midpointBearing(dLay);
  const sA = midpointBearing(sLay);

  const [lx, ly] = projectToCanvas([lodge], center, zoom, width, height)[0];
  const [jx, jy] = projectToCanvas([junction], center, zoom, width, height)[0];
  const [ux, uy] = projectToCanvas([dump], center, zoom, width, height)[0];
  const tail = sLay[sLay.length - 1];

  return (
    <div className="fg-map">
      {url ? <img src={url} alt="The supply lay on Valley Rd and the private drive" /> : null}
      <svg viewBox={`0 0 ${width} ${height}`} className="fg-map-ov" aria-hidden="true">
        <path d={svgPath(dLay)} stroke="#EF8200" strokeWidth={5} fill="none" strokeLinejoin="round" />
        <path d={svgPath(sLay)} stroke="#EF8200" strokeWidth={5} fill="none" strokeLinejoin="round" />
        {crossingAtDump ? (
          <>
            <path d={`M${tail[0]} ${tail[1]} L${ux} ${uy}`} stroke="#EF8200" strokeWidth={5}
                  fill="none" strokeDasharray="6 5" />
            <circle cx={(tail[0] + ux) / 2} cy={(tail[1] + uy) / 2} r={13}
                    fill="none" stroke="#c8553d" strokeWidth={2.5} />
          </>
        ) : null}
        <g transform={`translate(${dA.x},${dA.y}) rotate(${dA.angle})`}>
          <path d="M-12 -10 L14 0 L-12 10 Z" fill="#EF8200" />
        </g>
        <g transform={`translate(${sA.x},${sA.y}) rotate(${sA.angle})`}>
          <path d="M-12 -10 L14 0 L-12 10 Z" fill="none" stroke="#EF8200" strokeWidth={3} />
        </g>
        <circle cx={lx} cy={ly} r={8} fill="#c8553d" stroke="#1c1f25" strokeWidth={3} />
        <circle cx={jx} cy={jy} r={6} fill="#e6ebef" stroke="#1c1f25" strokeWidth={3} />
        <circle cx={ux} cy={uy} r={8} fill="#8f9aa4" stroke="#1c1f25" strokeWidth={3} />
        <g className="fg-map-label">
          <text x={lx + 13} y={ly - 3}>THE LODGE</text>
          <text x={jx - 11} y={jy - 3} textAnchor="end">DROP</text>
          <text x={ux + 13} y={uy + 2}>DUMP</text>
        </g>
      </svg>
    </div>
  );
}
