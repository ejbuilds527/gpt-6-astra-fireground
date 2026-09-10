import {
  toLatLon, projectToCanvas, offsetPolyline, svgPath, midpointBearing,
  autoFit, boundsCenter, type LatLon, type Polyline,
} from '../lib/geo';
import { staticMapUrl, viewportFor } from '../lib/staticmap';

type Props = {
  loaded: Polyline;         // fill site -> dump, carrying water
  empty: Polyline;          // dump -> fill site
  dump: LatLon;
  fill: LatLon;
  loadedMin?: number;
  emptyMin?: number;
  width?: number;
  height?: number;
};

export default function ShuttleMap({
  loaded, empty, dump, fill, loadedMin, emptyMin, width = 560, height = 520,
}: Props) {
  const l = toLatLon(loaded);
  const e = toLatLon(empty);
  const all = [...l, ...e];
  if (all.length < 2) return null;

  const center = boundsCenter(all);
  const zoom = autoFit(all, width, height, 18);
  const url = staticMapUrl(viewportFor(center, zoom, width, height));

  const lPx = offsetPolyline(projectToCanvas(l, center, zoom, width, height), 5.5);
  const ePx = offsetPolyline(projectToCanvas(e, center, zoom, width, height), -5.5);
  const lA = midpointBearing(lPx);
  const eA = midpointBearing(ePx);
  const [dx, dy] = projectToCanvas([dump], center, zoom, width, height)[0];
  const [fx, fy] = projectToCanvas([fill], center, zoom, width, height)[0];

  return (
    <div className="fg-map">
      {url ? <img src={url} alt="The tanker shuttle between the dump site and the fill site" /> : null}
      <svg viewBox={`0 0 ${width} ${height}`} className="fg-map-ov" aria-hidden="true">
        <path d={svgPath(lPx)} stroke="#EF8200" strokeWidth={5} fill="none" strokeLinejoin="round" />
        <path d={svgPath(ePx)} stroke="#8f9aa4" strokeWidth={5} fill="none"
              strokeLinejoin="round" strokeDasharray="10 7" />
        <g transform={`translate(${lA.x},${lA.y}) rotate(${lA.angle})`}>
          <path d="M-12 -10 L14 0 L-12 10 Z" fill="#EF8200" />
        </g>
        <g transform={`translate(${eA.x},${eA.y}) rotate(${eA.angle})`}>
          <path d="M-12 -10 L14 0 L-12 10 Z" fill="none" stroke="#8f9aa4" strokeWidth={3} />
        </g>
        <circle cx={dx} cy={dy} r={9} fill="#c8553d" stroke="#1c1f25" strokeWidth={3} />
        <circle cx={fx} cy={fy} r={9} fill="#5aabb3" stroke="#1c1f25" strokeWidth={3} />
        <g className="fg-map-label">
          <text x={dx - 14} y={dy - 3} textAnchor="end">DUMP</text>
          <text x={fx + 14} y={fy - 3}>FILL 1-18</text>
          {loadedMin != null ? <text x={14} y={24}>LOADED {loadedMin.toFixed(1)} min</text> : null}
          {emptyMin != null ? <text x={14} y={42} className="fg-map-sub">EMPTY {emptyMin.toFixed(1)} min</text> : null}
        </g>
      </svg>
    </div>
  );
}
