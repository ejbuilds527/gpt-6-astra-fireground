import { withAuth, signOut, getWorkOS } from '@workos-inc/authkit-nextjs';

// The demonstration incident. Replaced by real dispatch parsing during the build.
const INCIDENT = { label: 'Structure fire, Silvermine Rd, New Canaan', lat: 41.1712, lon: -73.4531 };

// Bearing from the station to the incident. Code measures; the model never estimates a number.
function bearing(fromLat: number, fromLon: number, toLat: number, toLon: number) {
  const rad = Math.PI / 180;
  const dLon = (toLon - fromLon) * rad;
  const y = Math.sin(dLon) * Math.cos(toLat * rad);
  const x =
    Math.cos(fromLat * rad) * Math.sin(toLat * rad) -
    Math.sin(fromLat * rad) * Math.cos(toLat * rad) * Math.cos(dLon);
  const deg = (Math.atan2(y, x) / rad + 360) % 360;
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return { deg: Math.round(deg), point: points[Math.round(deg / 22.5) % 16] };
}

function miles(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180, R = 3958.8;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(h))).toFixed(1);
}

export default async function AppPage() {
  const { user, role, permissions, organizationId } = await withAuth({ ensureSignedIn: true });

  // The station lives on the ORGANISATION, not the user. Every member of a department
  // responds from the same house, and a mutual aid company responds from a different one.
  // That is what makes direction of approach a property of who signed in.
  let org: { name?: string; metadata?: Record<string, string> } = {};
  if (organizationId) {
    try {
      org = await getWorkOS().organizations.getOrganization(organizationId);
    } catch {
      org = {};
    }
  }
  const m = org.metadata ?? {};
  const lat = Number(m.hq_lat), lon = Number(m.hq_lon);
  const haveStation = Number.isFinite(lat) && Number.isFinite(lon);
  const b = haveStation ? bearing(lat, lon, INCIDENT.lat, INCIDENT.lon) : null;

  const rows: [string, string][] = [
    ['user', user.email],
    ['department', org.name ?? '—'],
    ['station', m.station_id ?? '—'],
    ['hq address', m.hq_address ?? 'NOT SET — the approach direction cannot be computed'],
    ['apparatus', m.apparatus ?? '—'],
    ['role', role ?? '—'],
    ['permissions', permissions?.length ? permissions.join(', ') : 'none assigned'],
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-ember-600 dark:text-ember-400">
        Astra-FD
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight">
        {org.name ?? 'You are signed in.'}
      </h1>
      <p className="mt-3 text-ground-400">
        This is the holding page. The water-supply build replaces it.
      </p>

      {b && (
        <div className="mt-8 rounded-md border border-ember-200 bg-ember-50 p-4 dark:border-ember-800 dark:bg-ember-900/20">
          <p className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-ember-700 dark:text-ember-400">
            Approach
          </p>
          <p className="mt-1 text-lg">
            Responding <strong>{b.point}</strong> ({b.deg}&deg;), {miles(lat, lon, INCIDENT.lat, INCIDENT.lon)} mi
          </p>
          <p className="mt-1 text-sm text-ground-400">
            from {m.hq_address} to {INCIDENT.label}
          </p>
        </div>
      )}

      <dl className="mt-8 divide-y divide-ground-200 border-y border-ground-200 dark:divide-ground-700 dark:border-ground-700">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 py-2.5 font-[family-name:var(--font-mono)] text-sm">
            <dt className="w-32 shrink-0 text-ground-400">{k}</dt>
            <dd className="break-all">{v}</dd>
          </div>
        ))}
      </dl>

      <form action={async () => { 'use server'; await signOut(); }} className="mt-8">
        <button className="rounded-md border border-ground-300 px-4 py-2 text-sm font-medium hover:bg-ground-100 dark:border-ground-600 dark:hover:bg-ground-800">
          Sign out
        </button>
      </form>
    </main>
  );
}
