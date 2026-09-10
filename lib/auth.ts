import 'server-only';
import { getWorkOS, withAuth } from '@workos-inc/authkit-nextjs';
import { cache } from 'react';
import { isRole, type Role } from './roles';

export const currentIdentity = cache(async () => {
  const session = await withAuth();
  if (!session.user || !session.organizationId) return null;
  const org = await getWorkOS().organizations.getOrganization(session.organizationId);
  const role = org.metadata.role_view;
  if (!isRole(role)) return null;
  // Deliberate allowlist: never serialize credentials or the complete org metadata.
  return {
    userId: session.user.id, orgId: org.id, orgName: org.name, role,
    display: org.metadata.display || org.name,
    station: org.metadata.station_id || 'NOT SET',
    bearing: org.metadata.arrives_from_compass || 'UNKNOWN',
    distance: org.metadata.straight_mi || 'UNKNOWN',
    capacitySource: org.metadata.tanker_gallons_source || 'UNKNOWN',
    shuttlePosition: org.metadata.shuttle_position || 'NOT SET', relayPosition: org.metadata.relay_position || 'NOT SET',
  };
});
export async function requireRole(role: Role) {
  const identity = await currentIdentity();
  if (!identity || identity.role !== role) throw new Error('ROLE_FORBIDDEN');
  return identity;
}
export { sameOrigin } from './public-url';
