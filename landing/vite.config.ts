import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// SEO files (robots.txt, sitemap.xml, llms.txt) live as templates in seo/
// with %SITE_URL% / %APP_URL% placeholders, so the domain is only ever
// defined through env (VITE_SITE_URL / VITE_APP_URL) — never hardcoded.
// The same %SITE_URL% placeholder is substituted into index.html
// (canonical, og:url, JSON-LD).
const SEO_FILES = ['robots.txt', 'sitemap.xml', 'llms.txt'] as const;

function seoFiles(siteUrl: string, appUrl: string): Plugin {
  const render = (name: string): string =>
    readFileSync(resolve(__dirname, 'seo', name), 'utf8')
      .replaceAll('%SITE_URL%', siteUrl)
      .replaceAll('%APP_URL%', appUrl);

  return {
    name: 'jaqyn-seo-files',
    // 'pre' so placeholders are gone before Vite's HTML plugin decodeURIs
    // hrefs — a raw '%SI…' in an attribute is a malformed URI to it.
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    },
    // Build: emit rendered files into dist/ alongside public/ assets.
    generateBundle() {
      for (const name of SEO_FILES) {
        this.emitFile({ type: 'asset', fileName: name, source: render(name) });
      }
    },
    // Dev: serve the rendered files so /robots.txt etc. work locally.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = SEO_FILES.find((f) => req.url === `/${f}`);
        if (!name) return next();
        res.setHeader(
          'Content-Type',
          name.endsWith('.xml') ? 'application/xml' : 'text/plain; charset=utf-8',
        );
        res.end(render(name));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');
  // Public origins; prod values come from the deploy env (see DEPLOY.md),
  // defaults match the local dev servers.
  const siteUrl = (env.VITE_SITE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  const appUrl = (env.VITE_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  return {
    plugins: [react(), seoFiles(siteUrl, appUrl)],
  };
});
