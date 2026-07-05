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
    // IMPORTANT — ordering: Next.js applies rules top-to-bottom and the LAST
    // matching rule for a given header key wins.  The catch-all rule below sets
    // Referrer-Policy to strict-origin-when-cross-origin for every route, while
    // the /business/activate rule below it intentionally overrides that to
    // no-referrer so the invite token in the URL cannot leak via Referer.
    // The more-specific rule MUST come after the catch-all.

    // Hosts that must appear in the Content-Security-Policy:
    //
    //  Google Maps JS API — loaded dynamically via a <script> tag in
    //  MiniMap.tsx and LocationPicker.tsx; tiles are served from maps.gstatic.com.
    //
    //  Google Identity Services (GSI) — @react-oauth/google wraps the GSI
    //  library from accounts.google.com; it also renders a cross-origin iframe
    //  for the "Sign in with Google" button (frame-src) and makes connect-src
    //  calls to tokeninfo / oauth2 on accounts.google.com.
    //
    //  Sentry — connect-src for event ingestion; DSN host is region-specific
    //  (*.ingest.sentry.io covers o*.ingest.sentry.io / o*.ingest.us.sentry.io).
    //
    //  img-src — media assets are proxied through /media/ on the same origin
    //  (Django → Next rewrite) and in production are served from R2's public
    //  domain (pub-*.r2.dev).  Google Maps static tile embeds go to maps.gstatic.com.
    //
    //  2GIS MapGL — the DEFAULT map provider (NEXT_PUBLIC_MAP_PROVIDER=2gis).
    //  MiniMap.tsx injects a <script> from mapgl.2gis.com (script-src) which
    //  fetches styles/tiles/sprites from various *.2gis.com / 2gis.ru hosts at
    //  runtime (connect-src + img-src); wildcards cover the tile CDN fan-out.

    const isDev = process.env.NODE_ENV === "development";

    // script-src: 'unsafe-eval' is required by Next.js in development mode
    // (hot-reload / eval-based source-maps).  In production it is omitted.
    // 'unsafe-inline' is needed for Next.js runtime inline scripts.
    const scriptSrc = isDev
      ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://accounts.google.com https://mapgl.2gis.com`
      : `script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://accounts.google.com https://mapgl.2gis.com`;

    // Full CSP string.  This is shipped as Report-Only (not enforced) as the
    // deliberate first step — violations are logged to the browser console so
    // they can be reviewed and the policy tightened before switching to enforce.
    // No report-uri/report-to endpoint is configured at this stage (out of scope).
    const csp = [
      `default-src 'self'`,
      scriptSrc,
      // style-src: 'unsafe-inline' needed for Tailwind's runtime utility classes
      // and Next.js's own injected <style> elements.
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      // img-src: data: for inline SVG/base64, blob: for canvas/QR exports,
      // maps.gstatic.com for Google Maps tile images, *.r2.dev for R2 media in prod.
      `img-src 'self' data: blob: https://maps.gstatic.com https://*.r2.dev https://*.2gis.com https://*.2gis.ru`,
      // font-src: data: covers inline base64 fonts; googleapis/gstatic for web fonts.
      `font-src 'self' data: https://fonts.gstatic.com`,
      // connect-src: Sentry event ingest; Google Maps geocoding / Places API;
      // Google accounts for OAuth token exchange.
      `connect-src 'self' https://*.ingest.sentry.io https://maps.googleapis.com https://accounts.google.com https://*.2gis.com https://*.2gis.ru`,
      // frame-src: GSI renders the "Sign in with Google" button inside a
      // cross-origin iframe served from accounts.google.com.
      `frame-src https://accounts.google.com`,
      // worker-src: blob: required for Google Maps JS API web workers.
      `worker-src blob:`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join("; ");

    return [
      // --- Catch-all: security headers for every route ---
      {
        source: "/(.*)",
        headers: [
          // Prevents browsers from MIME-sniffing a response away from its
          // declared Content-Type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Blocks this page from being embedded in any frame/iframe.
          { key: "X-Frame-Options", value: "DENY" },
          // Sends the full URL to same-origin; only the origin to cross-origin
          // HTTPS; nothing to HTTP — hides path/query tokens from third parties.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera: needed for the QR scanner (html5-qrcode).
          // Geolocation: needed for the "nearby businesses" map (MiniMap.tsx).
          // Microphone: not used — explicitly denied.
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self)",
          },
          // Report-Only CSP — violations are logged to the browser console but
          // the page is NOT blocked.  Intentional first step so the policy can
          // be observed and refined before switching to Content-Security-Policy.
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
      // --- Per-route override — must come AFTER the catch-all (see note above) ---
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
