import { points, nearestSegment } from './lib/geometry';
import { db } from './lib/data';
const DRIVE = [[41.16412,-73.46857],[41.16399,-73.46817],[41.16399,-73.46784],[41.16405,-73.4676],[41.16416,-73.4674],[41.16425,-73.46734],[41.16428,-73.46732],[41.16435,-73.46733],[41.16444,-73.46735],[41.16449,-73.46734],[41.16457,-73.46726],[41.16465,-73.46717],[41.16502,-73.46696],[41.16506,-73.46695],[41.16508,-73.46697],[41.16509,-73.46693],[41.16513,-73.46685],[41.16519,-73.46676],[41.16532,-73.46664],[41.16543,-73.46656],[41.16557,-73.46652],[41.16571,-73.46651],[41.16585,-73.46654],[41.166,-73.46656],[41.16618,-73.46652],[41.16636,-73.46655],[41.16659,-73.46668],[41.16668,-73.46678]];
const STREET = [[41.16468,-73.46724],[41.16455,-73.46696],[41.16438,-73.46667],[41.16412,-73.46634],[41.16398,-73.46619],[41.16381,-73.46609],[41.16374,-73.46605],[41.16347,-73.46593],[41.16295,-73.46569],[41.16251,-73.46551],[41.16228,-73.46537],[41.16214,-73.46527],[41.16146,-73.46473],[41.16084,-73.46423],[41.16056,-73.46396]];
async function main() {
  const street = points(STREET);
  console.log('street vertices', street.length);
  for (const [i, p] of DRIVE.entries()) {
    const m = nearestSegment({ lat: p[0], lon: p[1] }, street);
    if (i < 6 || (m.offset_m > 30 && m.offset_m < 120)) console.log(`drive[${i}] offset ${m.offset_m.toFixed(0)}m ${m.side} seg ${m.segment}`);
  }
  const doc = await db.doc('routes/dump-site').get();
  const d = doc.data()!;
  console.log('dump lat', typeof d.lat, d.lat, 'lon', typeof d.lon, d.lon);
  const dm = nearestSegment({ lat: Number(d.lat), lon: Number(d.lon) }, street);
  console.log('dump side', dm.side, dm.offset_m.toFixed(0) + 'm', 'seg', dm.segment);
}
main().catch(e => { console.error('FAILED', e.message); process.exit(1); });
