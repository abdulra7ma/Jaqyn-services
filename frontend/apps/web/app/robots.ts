import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/config";

// Auth-gated, token-based or personal routes — never useful in a search
// index and some carry one-time tokens in the URL.
const PRIVATE_PATHS = [
  "/business/",
  "/staff/",
  "/profile",
  "/loyalty",
  "/campaign-wallet",
  "/rewards",
  "/qr",
  "/scan",
  "/collect",
  "/q/",
  "/c/",
  "/onboarding",
  "/pitch",
  "/forgot-password",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // One rule for every crawler, AI assistants included: public discovery
      // pages stay indexable, personal/tokenized flows stay out.
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
