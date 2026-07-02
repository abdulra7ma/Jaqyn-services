/** @type {import('next').NextConfig} */
// When NEXT_PUBLIC_API_URL is relative/empty, API calls go to /api/* on this same
// origin and Next proxies them to the backend — keeps everything one origin (no
// mixed content / CORS) so it works behind a single HTTPS tunnel.
const apiTarget = process.env.API_PROXY_TARGET || "http://localhost:8000";

const nextConfig = {
  output: "standalone",
  // Allow an isolated build dir per dev server (avoids .next corruption when
  // several `next dev` instances run against this app at once). Defaults to .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  transpilePackages: ["@jaqyn/api", "@jaqyn/ui", "@jaqyn/i18n"],
  // Don't redirect /api/foo/ → /api/foo (Django wants the trailing slash); just proxy.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      // `:path*` drops the incoming trailing slash, so Django would 301 to add it
      // back → infinite redirect loop. Force the trailing slash on the proxied
      // API path so Django matches directly. (Media are files — no trailing slash.)
      { source: "/api/:path*", destination: `${apiTarget}/api/:path*/` },
      { source: "/media/:path*", destination: `${apiTarget}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        // M11: prevent the invite token (present in the URL on first load) from
        // leaking to third-party origins via the Referer header.
        source: "/business/activate",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

module.exports = nextConfig;
