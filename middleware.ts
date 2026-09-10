import { authkitMiddleware } from '@workos-inc/authkit-nextjs';

// redirectUri is passed EXPLICITLY, not read from the environment.
//
// This middleware runs in Next's EDGE runtime, which does not see variables set on
// the Cloud Run service at runtime -- an edge bundle only carries what was inlined
// when it was built. Relying on process.env here produced:
//   "You must provide a redirect URI in the AuthKit middleware or in the environment"
// and every route returned 500. Measured 2026-09-10.
//
// It must EXACTLY match a registered redirect URI in WorkOS.
//
// AND IT POINTS AT CLOUD RUN, NOT AT FIREBASE HOSTING. Firebase Hosting forwards
// exactly ONE cookie to a backend -- `__session` -- and strips every other. AuthKit
// needs TWO: the session cookie and a PKCE cookie. Behind Firebase the callback
// fails with `missing_pkce_cookie` every time. Measured 2026-09-10.
// Firebase Hosting cannot front an auth flow. The static landing page can live
// there; the authenticated app cannot.
export default authkitMiddleware({
  redirectUri: 'https://astra-fd-wtd6z6dysa-ue.a.run.app/callback',
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ['/', '/callback'],
  },
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
