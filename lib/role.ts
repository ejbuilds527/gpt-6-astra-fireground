// One role vocabulary, shared with the callback and cookie-selecting proxy.
export { roles, isRole, roleCookie, roleForPath, type Role } from './roles';
export type SurfaceIdentity = {
  userId: string; orgId: string; orgName: string; role: import('./roles').Role;
  display: string; station: string; bearing: string; distance: string;
  capacitySource: string; shuttlePosition: string; relayPosition: string;
};
