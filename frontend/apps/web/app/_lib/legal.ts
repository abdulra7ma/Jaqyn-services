// Legal pages (Privacy Policy + Terms) are hosted on the marketing/landing site,
// which is a separate origin in production. NEXT_PUBLIC_LANDING_URL points at it;
// defaults to the local landing dev server. Trailing slash stripped for clean joins.
const LANDING_URL = (process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:5173").replace(/\/$/, "");

export const PRIVACY_URL = `${LANDING_URL}/privacy.html`;
export const TERMS_URL = `${LANDING_URL}/terms.html`;
