---
title: SEO & Online Visibility — Non-Technical Guide
service: shared
type: guide
status: active
last_reviewed: 2026-07-06
---
# SEO & Online Visibility — Non-Technical Guide

How to get Jaqyn found on Google, Yandex and AI assistants (ChatGPT, Claude,
Perplexity). Written for a non-technical reader: no code involved — everything
technical is already built into the sites. This is the checklist of accounts
to register, buttons to press, and habits that keep visibility growing.

**The two sites:**
- `jaqyn.kg` — the marketing (landing) site. This is what should rank in search.
- `app.jaqyn.kg` — the app itself. Only a few public pages of it are searchable; the rest is behind login, on purpose.

---

## 1. What is already done (no action needed)

The sites already tell search engines and AI assistants everything they need:

| Thing | What it does |
|---|---|
| Sitemap | A file listing every page we want indexed. Search engines read it automatically. |
| Robots file | Tells crawlers what they may look at. We explicitly welcome Google, Yandex, and the AI crawlers (ChatGPT, Claude, Perplexity, Gemini). Private app pages (wallets, QR codes, dashboards) are blocked. |
| Page titles & descriptions | Written in Russian — the language people in Kyrgyzstan search in. This is the text that appears in search results. |
| Company info card (structured data) | Machine-readable facts: name Jaqyn, market Kyrgyzstan, contacts, Instagram/Telegram. Helps Google show a proper company result. |
| llms.txt | A plain-language summary of what Jaqyn is, written specifically for AI assistants to read. |

None of this needs maintenance. If the domain ever changes, it is one setting
per service plus a redeploy — no code edits (see `DEPLOY.md`, "Adding a custom
domain later").

---

## 2. One-time registrations (do these once, ~1 hour total)

Do these **after** the sites are live on the real domain.

### 2.1 Google Search Console — the important one
1. Go to **search.google.com/search-console** (any Google account).
2. Add property → choose **Domain** → enter `jaqyn.kg`. One property covers the landing AND the app subdomain.
3. Google shows a **DNS TXT record** — a short line of text to add where the domain's DNS is managed. Add it, wait a few minutes, press **Verify**. (If unsure where DNS lives: it's the same place the domain was bought / where nameservers point.)
4. In the left menu → **Sitemaps** → submit both:
   - `https://jaqyn.kg/sitemap.xml`
   - `https://app.jaqyn.kg/sitemap.xml`
5. Top search bar (**URL Inspection**) → paste `https://jaqyn.kg/` → press **Request Indexing**. This skips days of waiting.

### 2.2 Yandex Webmaster — matters in Kyrgyzstan
1. **webmaster.yandex.com** → add both sites.
2. Verify with a DNS record (same idea as Google).
3. Submit the same two sitemap addresses.

### 2.3 Bing Webmaster — feeds ChatGPT search & Copilot
1. **bing.com/webmasters** → sign in → choose **"Import from Google Search Console"**. One click, done.

### 2.4 Google Business Profile — optional but cheap
1. **business.google.com** → register "Jaqyn" as a company with the website.
2. Gives Jaqyn a company card on Google (the panel on the right when someone searches the name) and a Google Maps presence.

### 2.5 2GIS — the local heavyweight
Most Bishkek users find businesses through 2GIS, and AI assistants read it too.
Make sure Jaqyn itself has a company entry with the website link.

---

## 3. Winning the search for the name "Jaqyn"

Goal: someone types "jaqyn" or "жакын лояльность" → we are the first result.

Catch: *жакын* is an everyday Kyrgyz word ("near"), so we share the results
page with dictionaries and songs. The fixes are simple and free:

1. **Same name + website link everywhere.** Instagram bio, Telegram channel description, 2GIS entry, a LinkedIn company page — each must say "Jaqyn" and link to `jaqyn.kg`. These profiles also rank by themselves, so the first results page fills up with *our* properties.
2. **A few mentions with a link.** Any local news piece, startup directory, or partner site that writes "Jaqyn" and links to the site. Two or three is enough for the brand query.
3. **Both spellings on the site.** The landing should mention "Jaqyn (Жакын)" once, so search engines connect the Latin and Cyrillic spellings.
4. **Patience.** A new domain typically wins its own name within 1–2 months. Real users searching and clicking us is the strongest signal, and it grows on its own as businesses onboard.
5. **Optional shortcut:** a tiny Google Ads campaign on the keyword "jaqyn" puts us on top instantly while the free ranking warms up. Brand keywords cost cents per click.

---

## 4. Being recommended by AI assistants (ChatGPT, Claude, …)

There is no "submit here" button for AI assistants. What actually works:

- **Already done:** our sites welcome their crawlers and hand them a plain-language summary (`llms.txt`).
- **Bing registration** (§2.3) — ChatGPT's web search runs on Bing's index.
- **External mentions** — AI assistants trust what *other* sites say. Every 2GIS entry, review, directory listing, news article, or Reddit/Telegram mention of Jaqyn raises the chance an assistant recommends us when someone asks *"loyalty program app in Bishkek?"*.
- **Clear, factual text on the landing** — assistants quote plain statements, not slogans. The landing already states what Jaqyn is, for whom, and how it works.

---

## 5. Ongoing habits (this is the part agencies charge for)

Technical setup (above) is done and one-time. Growth after that comes from
content and mentions — a little each month beats a lot once:

- **Add pages that answer real searches.** Example queries worth a page each: "программа лояльности для кафе Бишкек", "как удержать клиентов в салоне". Each page = one more door into the site.
- **Collect mentions.** Every partner, every onboarded business, every event — ask for a link or a tag.
- **Check Search Console monthly.** Two numbers matter: are pages indexed (Coverage), and which queries bring people (Performance). If both grow, it's working.
- **Reviews on 2GIS / Google** from businesses using Jaqyn — social proof that both people and AI assistants read.

At Jaqyn's market size there is no need to hire an SEO agency: the technical
30% is done, and the remaining 70% (content + mentions) is exactly the work
listed above — it needs consistency, not expertise.

---

## 6. If the domain ever changes

1. Update the environment settings and redeploy (see `DEPLOY.md` → "Adding a custom domain later"). No code changes — domains are never written into the code.
2. Redirect the old domain to the new one (301 redirect) and keep it for at least a year.
3. In Google Search Console, use the **Change of Address** tool — it transfers the accumulated ranking to the new domain.
4. Re-verify the new domain in Search Console / Yandex / Bing and resubmit the sitemaps.
