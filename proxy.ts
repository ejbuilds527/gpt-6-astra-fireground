import { authkitProxy } from '@workos-inc/authkit-nextjs';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { publicRedirect } from './lib/public-url';
import { roleCookie, roleForPath } from './lib/roles';

const AUTHKIT_AUTHORIZE_URL = 'https://api.workos.com/user_management/authorize';

const auth = authkitProxy({
  redirectUri: 'https://fireground.meerkatops.app/callback',
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ['/', '/signin', '/signout', '/callback', '/api/ai-health', '/how-it-works.html', '/shuttle-map.png', '/api/ask', '/demo', '/demo/index.html', '/demo/lay-map.png', '/demo/shuttle-map.png', '/demo/theater-map.png'],
  },
});

function isPrefetch(request: NextRequest) {
  return request.headers.get('purpose') === 'prefetch'
    || (request.headers.get('sec-purpose') ?? '').includes('prefetch')
    || request.headers.has('next-router-prefetch');
}

// Mirrors the SDK's own test in dist/esm/pkce.js.
function isInitialDocumentRequest(request: NextRequest) {
  return (request.headers.get('accept') ?? '').includes('text/html')
    && !request.headers.has('rsc')
    && !request.headers.has('next-router-state-tree')
    && !isPrefetch(request);
}

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

  // The SDK stores the PKCE verifier cookie ONLY on an initial document request, because it
  // assumes a fetch/RSC request never completes OAuth. Next's router breaks that assumption:
  // it turns an external redirect on an RSC navigation into a hard navigation, so the browser
  // DOES reach AuthKit -- carrying no verifier -- and /callback then fails `missing_pkce_cookie`.
  // Measured 2026-09-10: GET /app/command returns Set-Cookie for `Accept: text/html` and no
  // Set-Cookie for `RSC: 1`, and both redirect to AuthKit. Clicking a <Link> into a role page
  // could therefore never sign in, and because the callback failed the fg_<role> cookie was
  // never written, so the next click repeated it. Send such a request to /signin instead: it is
  // a route handler, and a route handler stores the verifier whatever the Accept header says.
  // A prefetch must start no flow at all.
  const location = response?.headers.get('location');
  if (location?.startsWith(AUTHKIT_AUTHORIZE_URL) && !isInitialDocumentRequest(request)) {
    if (isPrefetch(request)) return new NextResponse(null, { status: 204 });
    return NextResponse.redirect(publicRedirect('/signin', request.headers), 307);
  }

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
export const config = { matcher: ['/((?!demo|_next/static|_next/image|favicon.ico|robots.txt).*)'] };
