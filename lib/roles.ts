export const roles = ['command', 'staging', 'shuttle', 'tanker', 'relay'] as const;
export type Role = typeof roles[number];
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && roles.includes(value as Role);
}
export function roleForPath(path: string): Role | undefined {
  if (path === '/settings') return 'command';
  const match = path.match(/^\/(?:app|api\/roles)\/(command|staging|shuttle|tanker|relay)(?:\/|$)/);
  return match ? match[1] as Role : undefined;
}
export const roleCookie = (role: Role) => `fg_${role}`;
