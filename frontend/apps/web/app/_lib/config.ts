// Support URL for customer help/support links.
// Default is the Jaqyn Telegram channel; set NEXT_PUBLIC_SUPPORT_URL
// to override (e.g., support email, help center, etc.).
export const SUPPORT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_URL ?? "https://t.me/jaqyn";

// Public origin of this app. Single source of truth for every absolute
// self-URL (robots, sitemap, metadataBase, llms.txt) — set
// NEXT_PUBLIC_SITE_URL in prod; defaults to the local dev server.
// `||` not `??`: the Dockerfile bakes unset build args as "" and an empty
// origin would make `new URL(SITE_URL)` throw at build.
// Trailing slash stripped for clean joins.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");

// Marketing/landing site origin (separate deploy). NEXT_PUBLIC_LANDING_URL
// in prod; defaults to the local landing dev server.
export const LANDING_URL = (
  process.env.NEXT_PUBLIC_LANDING_URL || "http://localhost:5173"
).replace(/\/$/, "");
