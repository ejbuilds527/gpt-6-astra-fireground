import { z } from 'zod';
import { bucket } from './data';
import type { FactPack } from './facts';

export const VISION_PROMPT = `You read aerial imagery and report GEOMETRY AS PIXEL FRACTIONS. Never state a distance, length, bearing or compass direction; code computes those from your points. Return ONLY JSON:
{"driveway":{"found":true,"centreline":[[0.1,0.2]],"entry_index":0,"structure_index":-1,"confidence":"HIGH|MEDIUM|LOW","unreadable":[]},"structure":{"centroid":[0.1,0.2],"which_building":""},"obstruction_hints":{"left_of_travel":[],"right_of_travel":[]}}
x and y are fractions of image width and height: 0,0 top-left; 1,1 bottom-right. Order the centreline from PUBLIC ROAD ENTRY to STRUCTURE. Give 8 to 20 points following every bend. Name canopy-hidden or uncertain stretches in unreadable. Do not extend a trace beyond the image or claim a complete driveway when an endpoint is off-frame. If the driveway cannot be identified return found:false and an empty centreline. Obstruction hints are visual observations, not surveyed clearances.`;
const fraction = z.number().finite().min(0).max(1);
const pixel = z.tuple([fraction, fraction]);
const schema = z.object({
  driveway: z.object({ found: z.boolean(), centreline: z.array(pixel).max(20), entry_index: z.number().int(), structure_index: z.number().int(), confidence: z.enum(['HIGH','MEDIUM','LOW']), unreadable: z.array(z.string()) }).strict(),
  structure: z.object({ centroid: pixel.nullable(), which_building: z.string() }).strict(),
  obstruction_hints: z.object({ left_of_travel: z.array(z.string()), right_of_travel: z.array(z.string()) }).strict(),
}).strict();
export const frameSchema = z.object({ center_lat: z.number().min(-85).max(85), center_lon: z.number().min(-180).max(180), zoom: z.number().int().min(0).max(24), size_px: z.number().positive().max(4096), scale: z.number().positive().max(4) });
export type VisionFrame = z.infer<typeof frameSchema>;
export type VisionAssets = { image: string; frame: VisionFrame; source: string };
export async function loadVisionAssets(): Promise<VisionAssets> {
  const [image, metadata] = await Promise.all([
    bucket.file('site/silver-hill/silverhill-satellite.png').download(),
    bucket.file('site/silver-hill/bounds.json').download(),
  ]);
  const bounds = JSON.parse(metadata[0].toString());
  const frame = frameSchema.parse(bounds);
  if (!/mercator/i.test(bounds.projection || '')) throw new Error('Unknown image projection');
  const png = image[0];
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== frame.size_px * frame.scale || png.readUInt32BE(20) !== frame.size_px * frame.scale) throw new Error('Satellite dimensions do not match projection metadata');
  return { image: 'data:image/png;base64,' + png.toString('base64'), frame, source: 'gs://fireground-mapdata/site/silver-hill/silverhill-satellite.png + bounds.json' };
}
// Port of astra-vision.py: scaled image pixels -> world pixels -> Web Mercator lat/lon.
export function pixelToLatLon(point: [number, number], input: VisionFrame): [number, number] {
  const [fx, fy] = pixel.parse(point), f = frameSchema.parse(input);
  const world = 256 * 2 ** f.zoom, width = f.size_px * f.scale;
  const cx = (f.center_lon + 180) / 360 * world;
  const sin = Math.sin(f.center_lat * Math.PI / 180);
  const cy = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
  const x = cx + (fx * width - width / 2) / f.scale;
  const y = cy + (fy * width - width / 2) / f.scale;
  return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / world))) * 180 / Math.PI, x / world * 360 - 180];
}
export function measureVision(raw: unknown, frame: VisionFrame, source: string) {
  const observation = schema.parse(raw), d = observation.driveway;
  if (d.found && (d.centreline.length < 8 || d.entry_index !== 0 || ![-1, d.centreline.length - 1].includes(d.structure_index))) throw new Error('Invalid entry-to-structure centreline');
  if (!d.found && d.centreline.length) throw new Error('Unidentified driveway cannot carry geometry');
  const latlon = d.found ? d.centreline.map(p => pixelToLatLon(p, frame)) : [];
  let length = 0;
  const radians = (n: number) => n * Math.PI / 180;
  for (let i = 1; i < latlon.length; i++) {
    const a = latlon[i - 1], b = latlon[i], p1 = radians(a[0]), p2 = radians(b[0]);
    const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(radians(b[1] - a[1]) / 2) ** 2;
    length += 2 * 20902231 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  if (d.found && length <= 0) throw new Error('Degenerate centreline');
  return { observation, frame, source, latlon, measured_ft: d.found ? length : null,
    status: d.found ? 'MODEL_TRACED_CODE_MEASURED' : 'NEEDS A MEASUREMENT',
    limitation: 'Image interpretation, not a survey. Hidden stretches and off-frame endpoints cannot be verified.' };
}
export type VisionMeasurement = ReturnType<typeof measureVision>;
export function visionFacts(vision: VisionMeasurement): FactPack {
  const facts: FactPack = {};
  const add = (id: string, value: unknown, unit: string) => { facts[id] = { id, value, unit, source: vision.source + ' · Astra pixel trace; code projection and haversine; not surveyed' }; };
  add('F.VISION.status', vision.status, '');
  add('F.VISION.confidence', vision.observation.driveway.confidence, '');
  add('F.VISION.unreadable', vision.observation.driveway.unreadable, '');
  if (vision.measured_ft !== null) {
    add('F.VISION.driveway_ft', vision.measured_ft, 'ft');
    add('F.VISION.drive_polyline', vision.latlon, 'lat,lon pairs');
    add('F.VISION.pixel_fractions', vision.observation.driveway.centreline, 'fractions');
    add('F.VISION.obstruction_hints', vision.observation.obstruction_hints, '');
    add('F.VISION.direction', 'public road entry -> structure', '');
  }
  return facts;
}
