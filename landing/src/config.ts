// Live app (Next.js frontend) base URL. Mirrors the backend FRONTEND_URL setting:
// prod = the deployed frontend host, dev = the local Next.js dev server on :3000.
// Trailing slash stripped so route helpers can concatenate cleanly.
const APP_URL = (import.meta.env.VITE_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Absolute URL into the live customer/business app. */
export function appUrl(path: string): string {
  return `${APP_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

// Canonical entry points into the live app, confirmed against the frontend route tree.
export const APP_ROUTES = {
  explore: appUrl('/nearby'), // customer discovery (nearby businesses + deals)
  customerLogin: appUrl('/login'),
  businessLogin: appUrl('/business/login'),
} as const;
