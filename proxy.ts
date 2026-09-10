import { authkitProxy } from '@workos-inc/authkit-nextjs';
import type { NextRequest, NextFetchEvent } from 'next/server';
import { roleCookie, roleForPath } from './lib/roles';

const auth = authkitProxy({
  redirectUri: 'https://fireground.meerkatops.app/callback',
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ['/', '/signin', '/callback', '/api/ai-health', '/how-it-works.html', '/shuttle-map.png', '/api/ask'],
  },
});

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const role = roleForPath(request.nextUrl.pathname);
  const defaultCookie = process.env.WORKOS_COOKIE_NAME || 'wos-session';
  if (role) {
    const sealed = request.cookies.get(roleCookie(role))?.value;
    request.cookies.delete(defaultCookie);
    request.headers.delete('authorization');
    if (sealed) request.cookies.set(defaultCookie, sealed);
  }
  const response = await auth(request, event);
  if (role && response) {
    // SDK still verifies and refreshes the session. Persist a refresh only in this role's cookie.
    const cookies = response.headers.getSetCookie();
    response.headers.delete('set-cookie');
    for (const value of cookies) {
      response.headers.append('set-cookie', value.startsWith(defaultCookie + '=')
        ? roleCookie(role) + value.slice(defaultCookie.length) : value);
    }
  }
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'] };
