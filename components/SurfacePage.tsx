import 'server-only';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { incidentRef, incidentView, initialIncident } from '@/lib/incident';
import type { Role } from '@/lib/role';
import { Surface } from './Surface';

export async function SurfacePage({ role, children }: { role: Role; children?: ReactNode }) {
  // The proxy selects only fg_<role>; requireRole verifies the organization's metadata.
  const identity = await requireRole(role).catch(() => null);
  if (!identity) redirect('/signin');
  let initial = null;
  try {
    const incident = await incidentRef().get();
    initial = await incidentView(role, { ...initialIncident, ...incident.data() }, identity);
  } catch {
    // Render the role shell; the live endpoint retries without fabricated incident values.
  }
  return <Surface role={role} identity={identity} initial={initial}>{children}</Surface>;
}
