---
title: GTM 01 — Positioning & Ideal Customer Profile
service: platform
type: strategy
status: active
last_reviewed: 2026-07-07
---

# Positioning & ICP — Jaqyn

Beachhead: **Bishkek, Kyrgyzstan**. Primary segments: **cafés & coffee shops, beauty salons/barbershops, small retail**. Main displaced alternative (per founder): **existing loyalty apps/aggregators**; secondary: paper punch cards / "do nothing".

Every claim below is grounded in the shipped codebase (routes and files cited). Unverifiable market facts are in [Open Questions](#open-questions).

---

## 1. Positioning statement

> **For independent Bishkek businesses — cafés, salons, and shops — that lose repeat customers because visits go unrewarded and untracked, Jaqyn is a phone-first loyalty and campaigns platform that brings customers back and turns regulars into recruiters, unlike loyalty aggregators that bury a business inside someone else's app and unlike POS loyalty modules that demand hardware, integration, and per-terminal fees.**

Short form (landing-grade): *Jaqyn brings your customers back — stamps, cashback, and "bring your friends" campaigns, run entirely from the phones you already have.*

### Why this framing holds (code-level proof)
- "Phone-first, no hardware": staff award and redeem by scanning the customer's personal QR from any phone — `frontend/apps/web/app/staff/scan`, unified dispatcher `POST /api/staff/campaigns/scan/`. No POS integration exists or is required.
- "Turns regulars into recruiters": group campaigns ("come with N friends", check-in window, leader reward) with invite links shared via WhatsApp/Telegram/Instagram — `backend/apps/campaigns/customer_urls.py` (`/campaign-groups/<id>/invite/`), share intents in `frontend/packages/i18n/src/locales.ts`.
- "Not buried in someone else's app": each business keeps its own branded card in the customer wallet (logo, accent color `Business.card_accent`) and its own public profile page (`/c/[id]`), while still getting aggregator-style discovery via the Nearby map (`/api/businesses/nearby/`).

---

## 2. Top 3 customer problems (ranked by pain severity)

| # | Problem (owner's words) | Severity driver | Jaqyn capability that solves it |
|---|---|---|---|
| 1 | "Customers come once and disappear. My punch cards get lost, forged, or forgotten — and I can't see any of it." | Retention is existential for venues with 20+ competitors per block; paper is unmeasurable and unforgeable-only-in-theory | Multi-form loyalty per business — stamps, visit counters, points→cashback with tier ladders — lived in a customer wallet that can't be lost (`backend/apps/loyalty/`, `/loyalty` wallet UI, `LoyaltyTier` model). Vouchers redeem once, enforced server-side (`/api/staff/loyalty/redeem-voucher/`). |
| 2 | "Getting NEW customers costs me Instagram ads and discount sites that eat my margin." | CAC via paid social is cash-out-of-pocket every month; discounters attract deal-hunters, not regulars | Group campaigns make existing customers do the acquisition: "bring 3 friends, everyone checks in, leader gets the reward" — with shareable invite links (`backend/apps/campaigns/`, group session flow `/campaigns/[id]/group/*`). Plus free placement on the Nearby discovery map with active-offer badges (`/nearby`). |
| 3 | "I have no idea what's working. Who are my regulars? Did that promo do anything?" | Owner decides everything alone; gut-feel promos waste money | Owner dashboard (scans, customers, redemption rate — `/api/business/dashboard/`), per-campaign analytics (views, joins, completions, estimated cost — `/api/business/campaigns/<id>/analytics/`), customer list with visit history (`/api/business/customers/`). |

---

## 3. Ideal Customer Profiles

### ICP-A — Independent café / coffee shop (primary)
- **Firmographics:** 1–2 locations in Bishkek, owner-operated, 3–15 staff, average ticket ~150–400 som, high visit frequency (daily/weekly potential). Not a franchise with mandated POS loyalty.
- **Budget authority:** The owner decides alone, same day. Spend threshold roughly "less than one day of revenue per month" before it needs no justification.
- **Where they are:** Instagram (business account is their storefront), 2GIS listings, WhatsApp/Telegram supplier and staff chats; offline — barista community, coffee festivals, their own counter 10 hours a day.
- **Trigger to look for a solution:** slow weekdays; a new competitor opening nearby; noticing regulars defect; annoyance at reprinting punch cards.
- **Main objections:** "My staff won't bother scanning." / "Customers won't install an app for a coffee shop." / "I tried a loyalty app; nobody used it."
- **What eases those objections in-product:** staff flow is one scan with audio confirm (`/staff/scan`); customer joins by scanning a table-tent QR — no app install, it's a web app (`/q/[token]` auto-join).

### ICP-B — Beauty salon / barbershop
- **Firmographics:** 1 location, 2–10 masters, appointment-driven, ticket ~500–2,500 som, natural 2–6 week visit cycle. Owner often also a working master.
- **Budget authority:** Owner; slightly slower decision (consults masters), but sticky once adopted because visit-counter rewards map exactly to their existing habit ("6th haircut free" verbal promises).
- **Where they are:** Instagram above all (portfolio = feed), booking via DM or phone; offline — beauty supply shops, trade WhatsApp groups.
- **Trigger:** no-shows and clients drifting to a cheaper master; wanting the "6th visit free" promise to feel official instead of trust-me.
- **Main objections:** "I already remember my regulars." / "My booking notebook/app works fine." / "Masters take clients personally when they leave — an app won't stop that."

### ICP-C — Small retail shop (flower shop, bakery counter, mini-market, boutique)
- **Firmographics:** 1–3 points of sale, 2–8 staff, ticket varies widely; loyalty fit is points-per-som cashback rather than stamps (`points per som spent` config in loyalty program setup).
- **Budget authority:** Owner; most price-sensitive of the three, thin margins.
- **Where they are:** 2GIS, Instagram, local bazaars/wholesale markets; less digitally fluent than A/B on average.
- **Trigger:** supermarket chains with plastic bonus cards siphoning customers; wanting the same "cashback in som" perception without a card-printing program.
- **Main objections:** "Cashback eats my margin." / "My cashiers are busy; one more step at the till slows the line."

---

## 4. Value proposition per ICP (customer language, no jargon)

- **ICP-A (café):** «Your regulars carry your stamp card in their phone — it never gets lost, never gets faked, and when it's full they come back to claim their free coffee. And your best customers bring their friends for you: "come with three friends" deals spread themselves on WhatsApp.»
- **ICP-B (salon):** «Make "the sixth visit is free" official. Every visit is counted automatically at checkout, the client sees exactly how close they are, and they get a reason to book with *you* again instead of trying someone cheaper.»
- **ICP-C (retail):** «Cashback in som on every purchase — like the big chains have, but without printing cards or buying equipment. Your cashier scans the customer's phone; done. You decide the percentage, the caps, and the expiry, so it never eats more margin than you planned.»

(Production copy is RU-first per market; these are the English masters. Kyrgyz-language gap noted in [Risks](#6-positioning-risks).)

---

## 5. Messaging hierarchy

**Primary message:** **«Jaqyn brings customers back.»** (Возвращает клиентов.) Everything ladders to repeat visits — the one outcome all three ICPs pay for.

**Pillar 1 — Loyalty they can't lose.**
Proof points: stamp cards, visit counters, points→cashback with status tiers, all runnable simultaneously by one business (`backend/apps/loyalty/`, multi-form loyalty); business-branded wallet cards (`Business.card_accent`); server-enforced one-time voucher redemption; rewards with business-defined caps and expiry.

**Pillar 2 — Your customers bring their friends.**
Proof points: group campaigns with check-in windows and leader rewards (`backend/apps/campaigns/`); invite links via WhatsApp/Telegram/Instagram share sheets; individual visit-challenges ("visit 3 times this week"); free listing on the Bishkek Nearby map with active-offer badges (`/api/businesses/nearby/`).

**Pillar 3 — Running in 15 minutes, on the phones you already have.**
Proof points: no POS integration, no hardware — staff scanner is a web app on any phone (`/staff/scan`, manual-entry fallback for bad cameras); self-serve onboarding wizard with 30-day free trial (`/business/register`, `trial_period_days = 30` in `apps/system`); owner dashboard and campaign analytics out of the box; Russian-first interface, prices in som.

---

## 6. Positioning risks

Honest weaknesses versus alternatives, and how messaging should handle each:

1. **Cold-start / empty map.** Aggregators' pitch is their existing audience; at launch Jaqyn's Nearby map is nearly empty, so "discovery" is a promise, not a fact. → Lead with Pillars 1 and 3 (value that works with the business's *own* customers from day one); treat discovery as a bonus, never the headline, until density exists. Do not sell "we bring you new customers from our app" before the map can show it.
2. **Scan friction vs POS-integrated loyalty.** POS modules accrue points automatically from the receipt; Jaqyn adds a scan step at the till and trusts staff to do it. → Message the flip side: works with *any* till or no till at all, zero integration cost, zero hardware. Avoid head-to-head "faster checkout" claims.
3. **Web app, not a native app.** No App Store/Play Store presence; iOS PWA support is limited (no push, weaker install prompt). Aggregator competitors likely have native apps. → Message "nothing to install — works instantly from a QR scan" as a feature for the *business's customers*; don't enter "download our app" comparisons.
4. **Unproven pricing / no billing.** There is no payment or plan-enforcement code (`Business` has trial fields but nothing charges after day 30). Every business is effectively free-forever today. → Say "free 30-day trial" externally; internally, treat pricing as undecided until `03-pricing.md`. Never publish a price on the landing page yet.
5. **Production blockers undermine "running in 15 minutes."** SMS/OTP provider is a dev stub (customers can't self-signup in prod without it), and invite emails don't actually send (`backend/apps/accounts/services.py` dev-log notifier; onboarding audit flags email path). → Founder-led, hand-held onboarding for the first cohort; do not run broad self-serve acquisition until B01/SMS lands.
6. **Kyrgyz language absent.** Locales are RU/EN only (`frontend/packages/i18n/src/locales.ts`); RU covers Bishkek core but Kyrgyz-first owners and customers exist. → Keep launch messaging RU; flag KY as a fast-follow, don't claim "in your language" universally.
7. **Social-proof campaign type is half-built.** Instagram-follow/tag campaigns exist in the backend but the customer-side flow isn't finished (`backend/apps/campaigns/services/social.py`; frontend overview notes FE pending). → Exclude from all external messaging until shipped; demo only individual + group campaigns.
8. **"Loyalty app fatigue" objection is real.** Owners who tried an aggregator and saw no usage will project that failure onto Jaqyn. → Counter with the structural difference: Jaqyn's loyalty lives at the *business's own* till and QR, not inside a third-party feed the customer must remember to open; plus per-campaign analytics so the owner *sees* usage or lack of it within weeks.

---

## Open Questions

Facts needed but not invented here — inputs for `02-market-analysis.md` and `03-pricing.md`:

1. **Which loyalty aggregators actually operate in Bishkek today** (names, pricing, merchant counts)? Founder identified "loyalty apps/aggregators" as the displaced alternative; the specific competitor set is unverified.
2. **Willingness to pay** per ICP in som/month — no pricing research exists and no billing code constrains the answer.
3. **Market size:** number of cafés, salons, and small retail in Bishkek (2GIS-derived leads DB in `apps/leads` may already approximate this — quantify it).
4. **POS penetration** among ICPs (iiko/Poster/r_keeper share) — determines how often risk #2 comes up in sales conversations.
5. **SMS provider choice and per-OTP cost in KG** — gates self-serve signup and affects unit economics.
6. **Whether customer phone-OTP is mandatory for v1** or email signup suffices for launch cohort (both exist in code; SMS is the blocked path).
