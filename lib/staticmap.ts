import { longitude, worldPixel, type MapViewport } from './geo';

export const MAP_COLORS = {
  landscape: '#23272e', road: '#333b43', roadStroke: '#3f4852',
  label: '#8f9aa4', hose: '#EF8200', loaded: '#5aabb3', ink: '#e6ebef',
} as const;

export type StaticMapOptions = MapViewport & { apiKey: string; scale?: 1 | 2 };

/** The same explicit viewport must be passed to the SVG projection. */
export function staticMapUrl({ apiKey, scale = 2, ...viewport }: StaticMapOptions): string {
  const { center, zoom, width, height } = viewport;
  if (!apiKey.trim()) throw new Error('Static map API key missing');
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 21) throw new Error('Invalid map zoom');
  if (![width, height].every(n => Number.isInteger(n) && n >= 1 && n <= 640)) throw new Error('Map size must be 1–640 logical pixels');
  worldPixel(center, zoom);
  const params = new URLSearchParams({ center: `${center.lat},${longitude(center)}`, zoom: String(zoom), size: `${width}x${height}`, scale: String(scale), maptype: 'roadmap', format: 'png', key: apiKey });
  const hex = (color: string) => color.replace('#', '0x');
  for (const style of [
    'feature:poi|visibility:off', 'feature:transit|visibility:off',
    `feature:landscape|element:geometry|color:${hex(MAP_COLORS.landscape)}`,
    `feature:road|element:geometry.fill|color:${hex(MAP_COLORS.road)}`,
    `feature:road|element:geometry.stroke|color:${hex(MAP_COLORS.roadStroke)}`,
    `element:labels.text.fill|color:${hex(MAP_COLORS.label)}`,
    `element:labels.text.stroke|color:${hex(MAP_COLORS.landscape)}`,
  ]) params.append('style', style);
  return `https://maps.googleapis.com/maps/api/staticmap?${params}`;
}
