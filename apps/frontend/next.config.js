// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Link previews (iMessage, Discord, Slack, X...) come from bots that don't
  // run JavaScript. Next 16 streams metadata into <body> for normal visitors;
  // this makes every request get the OG tags in <head>, which is what those
  // bots read. Our pages are tiny, so blocking on the metadata costs nothing
  htmlLimitedBots: /.*/,
  experimental: {
    // the dev /api proxy below buffers bodies and cuts them at 10 MB by
    // default; models go up to 95 MB (in production nginx proxies instead)
    proxyClientMaxBodySize: '100mb',
  },
  // Pages where a click grants access (the OAuth consent page) or changes
  // the account can't be framed by another site (clickjacking). The viewer
  // /m/<id> stays embeddable on purpose
  async headers() {
    const noFraming = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    ];
    return [
      ...['/oauth/:path*', '/dashboard', '/dashboard/:path*', '/auth/:path*'].map((source) => ({
        source,
        headers: noFraming,
      })),
      // upload pages (MAIN_URL/u/<token>): the link is the credential, so it
      // never leaves in a Referer, and the page can't be framed either
      { source: '/u/:token', headers: [...noFraming, { key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
  // In `pnpm dev` there's no nginx, so the dev server plays its part:
  // MAIN_URL/api/*, the MCP endpoint and OAuth discovery reach the backend
  // exactly like in production (var/docker/nginx.conf)
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_INTERNAL_URL}/:path*`,
      },
      { source: '/mcp', destination: `${process.env.BACKEND_INTERNAL_URL}/mcp` },
      { source: '/mcp/:key', destination: `${process.env.BACKEND_INTERNAL_URL}/mcp/:key` },
      {
        source: '/.well-known/:doc(oauth-authorization-server|oauth-protected-resource)/:rest*',
        destination: `${process.env.BACKEND_INTERNAL_URL}/.well-known/:doc/:rest*`,
      },
    ];
  },
};

export default nextConfig;
