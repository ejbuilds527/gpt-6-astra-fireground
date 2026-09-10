import { signOut } from '@workos-inc/authkit-nextjs';
import { cookies } from 'next/headers';
import { roleCookie, roles } from '@/lib/roles';

// A demonstration drives five role accounts through one browser. Signing in again is not
// enough to change role: WorkOS keeps its own session, so /signin returns the same role
// without asking. signOut() ends the WorkOS session as well as this app's, so the next
// sign-in asks for credentials. It clears wos-session and any orphaned PKCE verifier
// cookies; the fg_<role> cookies are ours, so this route clears those.
export const dynamic = 'force-dynamic';

export async function GET() {
  const jar = await cookies();
  for (const role of roles) jar.delete(roleCookie(role));
  await signOut({ returnTo: 'https://fireground.meerkatops.app/' });
}
