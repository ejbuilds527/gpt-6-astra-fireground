import { getSignInUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';

// getSignInUrl() sets a PKCE cookie. Next.js only permits writing cookies from a
// Server Action or a Route Handler -- calling it while rendering a page throws
// "Cookies can only be modified in a Server Action or Route Handler" and the page
// 500s. Measured 2026-09-10. So the landing page links HERE, and this redirects.
export const dynamic = 'force-dynamic';

export async function GET() {
  redirect(await getSignInUrl());
}
