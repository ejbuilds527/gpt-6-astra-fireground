/** @type {import('next').NextConfig} */
const nextConfig = {
  // STANDALONE, not 'export'. AuthKit exchanges the auth code server-side using the
  // API key and seals the session into an encrypted cookie. A static export has no
  // server to do either, so the login button would be decoration.
  output: 'standalone',
  reactStrictMode: true,
};

export default nextConfig;
