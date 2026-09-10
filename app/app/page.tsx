import { withAuth } from '@workos-inc/authkit-nextjs';
import { readSnapshot } from '@/lib/data';
import { demand, tankSeconds } from '@/lib/water';
export const dynamic = 'force-dynamic';
export default async function AppPage() {
  await withAuth({ ensureSignedIn: true });
  try {
    const data = await readSnapshot();
    const attack = data.settings.attack_scenario;
    const flow = demand(attack.lines.map((line: { gpm: number }) => line.gpm));
    const tank = flow.value === 'unknown' ? flow : tankSeconds(attack.tank_gallons, flow.value);
    return <main className="mx-auto max-w-3xl p-8"><p>{data.settings.policy.mode} · Fireground</p><h1>{data.site.label}</h1><p>{data.scenario.dispatch_text}</p><p>{data.scenario.location_confidence}</p><p>Demand: {flow.value} gpm · Tank: {typeof tank.value === 'number' ? Math.floor(tank.value) : tank.value} seconds</p><p>{data.settings.policy.disclaimer}</p></main>;
  } catch {
    return <main className="p-8"><h1>Fireground · supply unknown</h1><p>Stored incident inputs could not be read. Retry when the data connection is available.</p></main>;
  }
}
