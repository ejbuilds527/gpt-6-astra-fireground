import { Firestore } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
// Deployment coordinates only; all hydraulic inputs are read from documents.
export const db = new Firestore({ projectId: 'meerkatops-fireground', databaseId: '(default)' });
export const bucket = new Storage({ projectId: 'meerkatops-fireground' }).bucket('fireground-mapdata');
export type Document = Record<string, any>; // External Firestore records are validated at their numeric consumers.
export type Snapshot = { settings: Record<string, Document>; site: Document; sources: Document; relay: Document; shuttle: Document; scenario: Document; scenarioId: string; sideOfRoad?: Document };
export const scenarioIds = ['general-alarm', 'lodge-confirmed'] as const;
export async function readSettings() {
  const docs = await db.collection('settings').get();
  return Object.fromEntries(docs.docs.map(d => [d.id, d.data()]));
}
export async function readSnapshot(scenarioId = 'general-alarm'): Promise<Snapshot> {
  if (!scenarioIds.includes(scenarioId as typeof scenarioIds[number])) throw new Error('Unknown scenario');
  const paths = ['sites/silver-hill', 'sources/fill-route-hydrants', 'routes/relay-pull', 'routes/shuttle-loop', `scenarios/${scenarioId}`];
  const [settings, docs, side] = await Promise.all([readSettings(), db.getAll(...paths.map(p => db.doc(p))), db.doc('sources/hydrant_side_of_road').get()]);
  docs.forEach(d => { if (!d.exists) throw new Error(`Missing Firestore document: ${d.ref.path}`); });
  const [site, sources, relay, shuttle, scenario] = docs.map(d => d.data()!);
  return { settings, site, sources, relay, shuttle, scenario, scenarioId, sideOfRoad: side.data() };
}
export async function readMapBounds() {
  const [bytes] = await bucket.file('site/silver-hill/bounds.json').download();
  return JSON.parse(bytes.toString()) as Document;
}
