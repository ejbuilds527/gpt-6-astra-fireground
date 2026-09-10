import { getWorkOS, handleAuth } from '@workos-inc/authkit-nextjs';
import { cookies } from 'next/headers';
import { publicOrigin, publicRedirect } from '@/lib/public-url';
import type { NextRequest } from 'next/server';
import { isRole, roleCookie, type Role } from '@/lib/roles';

export async function GET(request: NextRequest) {
  let authenticatedRole: Role | undefined;
  const response = await handleAuth({
    returnPathname: '/app',
    baseURL: publicOrigin(request.headers),
    onSuccess: async ({ organizationId }) => {
      if (!organizationId) throw new Error('An organization is required');
      const org = await getWorkOS().organizations.getOrganization(organizationId);
      if (!isRole(org.metadata.role_view)) throw new Error('Organization has no Fireground role');
      authenticatedRole = org.metadata.role_view;
      const jar = await cookies();
      // handleAuth has already sealed and saved the SDK session, including refresh credentials.
      const session = jar.get(process.env.WORKOS_COOKIE_NAME || 'wos-session');
      if (!session) throw new Error('Session cookie was not saved');
      jar.set(roleCookie(authenticatedRole), session.value, {
        httpOnly: true, secure: publicOrigin(request.headers).startsWith('https:'),
        sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 400,
      });
    },
  })(request);
  if (authenticatedRole && response.status >= 300 && response.status < 400) {
    const location = publicRedirect(response.headers.get('location') ?? '/app', request.headers);
    location.pathname = '/app/' + authenticatedRole;
    location.search = '';
    response.headers.set('location', location.toString());
  }
  return response;
}
