import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/config";

// Only public, non-personalized entry pages. Everything behind auth (wallet,
// QR, business/staff areas) is excluded here and disallowed in robots.ts.
const PUBLIC_PATHS = ["/", "/nearby", "/campaigns", "/login", "/signup"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
