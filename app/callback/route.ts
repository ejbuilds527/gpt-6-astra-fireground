import { handleAuth } from '@workos-inc/authkit-nextjs';

// WorkOS redirects here with a code. handleAuth exchanges it for a session and
// seals it into an encrypted cookie, then sends the user on.
// This path must EXACTLY match a registered redirect URI -- an exact string match
// is the whole contract, and a mismatch fails at the end of a browser round trip.
export const GET = handleAuth({ returnPathname: '/app' });
