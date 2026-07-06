// Legal pages (Privacy Policy + Terms) are hosted on the marketing/landing site,
// which is a separate origin in production (LANDING_URL in _lib/config.ts).
import { LANDING_URL } from "./config";

export const PRIVACY_URL = `${LANDING_URL}/privacy.html`;
export const TERMS_URL = `${LANDING_URL}/terms.html`;
