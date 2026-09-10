import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { isRole } from '@/lib/roles';
import { incidentRef, incidentView, initialIncident } from '@/lib/incident';
import { Incident } from '@/components/Incident';
import LayMap from '@/components/LayMap';
import ShuttleMap from '@/components/ShuttleMap';
import { DRIVE_TRACE, LAY_JUNCTION, LODGE, DUMP_SITE, FILL_HYDRANT, MAP_ROUTES } from '@/lib/geo';

export const dynamic = 'force-dynamic';

export default async function RolePage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!isRole(role)) notFound();
  let identity;
  try { identity = await requireRole(role); } catch { redirect('/signin'); }

  let initial = null;
  try {
    const doc = await incidentRef().get();
    initial = await incidentView(role, { ...initialIncident, ...doc.data() }, identity);
  } catch {}

  const R = MAP_ROUTES as Record<string, string | undefined>;
  const showLay = role === 'command' || role === 'relay';
  const showShuttle = role === 'command' || role === 'shuttle' || role === 'tanker';

  return (
    <>
      <Incident role={role} identity={identity} initial={initial} />
      {showLay ? (
        <section className="fg-panel">
          <h2>The lay · nozzle to water</h2>
          <LayMap
            drive={DRIVE_TRACE}
            street={R.street ?? []}
            lodge={LODGE}
            junction={LAY_JUNCTION}
            dump={DUMP_SITE}
            driveSide="RIGHT"
            streetSide="LEFT"
          />
        </section>
      ) : null}
      {showShuttle ? (
        <section className="fg-panel">
          <h2>The tanker shuttle</h2>
          <ShuttleMap
            loaded={R.shuttleLoaded ?? []}
            empty={R.shuttleEmpty ?? []}
            dump={DUMP_SITE}
            fill={FILL_HYDRANT}
            loadedMin={0.9}
            emptyMin={0.8}
          />
        </section>
      ) : null}
    </>
  );
}
