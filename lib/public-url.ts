// Browser redirects must use the ingress origin, never the standalone bind address.
export function publicOrigin(headers: Headers) {
  const proto = headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? 'https';
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? 'fireground.meerkatops.app').split(',')[0].trim();
  // Only the deployed site and local development hosts are valid return destinations.
  if (host === 'fireground.meerkatops.app') return 'https://' + host;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return (proto === 'http' ? 'http' : 'https') + '://' + host;
  return 'https://fireground.meerkatops.app';
}
export function publicRedirect(location: string, headers: Headers) {
  const origin = publicOrigin(headers);
  const parsed = new URL(location, origin);
  // An absolute SDK Location can itself contain 0.0.0.0, so keep only its path/query.
  return new URL(parsed.pathname + parsed.search + parsed.hash, origin);
}
