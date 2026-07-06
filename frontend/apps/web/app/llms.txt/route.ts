import { LANDING_URL, SITE_URL } from "../_lib/config";

// Machine-readable site summary for AI assistant crawlers (llms.txt
// convention). Served as a route (not a public/ file) so the origins come
// from env, never a hardcoded domain.
const BODY = `# Jaqyn — web app

> This is the Jaqyn web application (customer loyalty wallet, QR scanning and campaigns, plus business and staff dashboards). Most of it requires an account. For what Jaqyn is, who it serves and how to contact us, see the main site: ${LANDING_URL}/llms.txt

- Marketing site: ${LANDING_URL}/
- Web app: ${SITE_URL}/
- Market: Kyrgyzstan (Bishkek). Languages: Russian (primary), Kyrgyz, English.
- Contact: hello@jaqyn.kg
`;

export function GET(): Response {
  return new Response(BODY, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
