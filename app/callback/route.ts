import { handleAuth } from '@workos-inc/authkit-nextjs';
import type { NextRequest } from 'next/server';
import { publicOrigin, publicRedirect } from '@/lib/public-url';

export async function GET(request: NextRequest) {
  const response = await handleAuth({
    returnPathname: '/app',
    baseURL: publicOrigin(request.headers),
  })(request);
  const location = response.headers.get('location');
  if (location) response.headers.set('location', publicRedirect(location, request.headers).toString());
  return response;
}
