---
title: Landing Page Refresh — Work Plan
service: landing
type: spec
status: active
last_reviewed: 2026-06-30
---
# Landing Page Refresh — Work Plan

Goal: update `landing/` so copy matches the platform's real features, drop stale/inaccurate
claims, fix dead links, and make the page more appealing + actionable for both customers and
business owners.

Status: planning. Nothing built yet.

---

## 1. Problem summary (current vs reality)

The landing page was written early and now **misrepresents the platform**.

### 1.1 Copy over-indexes on "group deals"
- Hero = "Unlock local rewards with your **friends**" — frames the whole product around group
  deals with friends.
- Reality: group is **one of three** campaign types. The real core surface is broader:
  - Loyalty stamp/visit/spend programs + **banking-style voucher wallet** (mint, expire, stack).
  - Campaigns: **visit**, **time-window**, **group**.
  - **Nearby discovery** with map + category filter (`/nearby`).
  - **Business analytics**: dashboard KPIs, retention/cohort, staff performance reports.
  - **Staff scan app** (roles: cashier/manager).
- Group deals belong on the page, but as *one pillar*, not the entire identity.

### 1.2 Stale / inaccurate claims (must fix — these are wrong, not just thin)
- **QR flow copy describes the old approval-code flow.** `QrLoyalty.tsx` says
  "Customer scans QR → enter staff code → collect stamp". Actual flow is the **unified visit
  scan**: staff scans the *customer's personal QR*; no staff approval code. (Ref:
  staff-scan-collect-flow.)
- **FAQ #3** "How do businesses verify customers? → QR codes, staff approval codes, staff
  redemption screens" — approval codes are gone.
- **QrLoyalty 6-step bullets** include "Phone login / Staff approval code" — outdated.

### 1.3 Dead / fake links (no real destinations)
- Every CTA is an in-page anchor:
  - "Explore Deals" → `#deals` (static demo cards, **not the real customer app**).
  - Footer "Dashboard" / "Join the pilot" → anchors, not the app.
  - Footer **Privacy** + **Terms** → `#top` (no legal pages exist).
  - Footer social icons → `#top`.
- **No login entry** for existing customers or business owners.
- **No path into the real product** at all — landing is a brochure with a lead form only.

### 1.4 Missing features worth showing
Not mentioned anywhere on the landing page:
- Nearby discovery + map.
- Rewards **wallet / vouchers** (active / used / expired).
- Visit & time-window campaigns (only group is shown).
- Business **reports** (retention cohorts, staff performance).
- Staff app.

---

## 2. Decisions — RESOLVED

1. **Customer entry point.** The Next.js frontend (`FRONTEND_URL`) IS the live app.
   Add a `VITE_APP_URL` env var to `landing/` (mirror of backend `FRONTEND_URL`:
   prod `https://jaqyn-frontend-production.up.railway.app`, dev `http://localhost:3000`).
   Real routes confirmed:
   - "Explore Deals" → `${APP_URL}/nearby` (discovery)
   - Customer login → `${APP_URL}/login`
   - Business login / "Dashboard" → `${APP_URL}/business/login`
   - Staff login (optional footer link) → `${APP_URL}/staff/login`
2. **Business login.** `${APP_URL}/business/login` (route exists). Keep the landing **lead
   form** (`#register`) as the pilot-waitlist funnel; self-serve `${APP_URL}/business/register`
   also exists if we want a direct link too.
3. **Legal pages.** Do NOT exist → **create** Privacy + Terms. Landing is a single-page Vite
   app with anchor nav and no router. Recommendation: add two standalone static pages
   (`landing/public/privacy.html` + `terms.html`) or minimal hash routes; footer links point
   to them. (Lowest-effort: static HTML in `public/`.)
4. **Positioning — RESOLVED.** Lead with **loyalty + rewards**. Make **campaigns** a headline
   selling point (visit / time-window / group). Treat **group deals** as *one reward/campaign
   option*, not the whole identity.

---

## 3. Work plan

### Phase 0 — Decisions ✅ RESOLVED (see §2)
- [x] Customer app URL = `${APP_URL}/nearby`; add `VITE_APP_URL` env to landing.
- [x] Business login = `${APP_URL}/business/login`.
- [x] Legal pages: create Privacy + Terms (static in `public/`).
- [x] Positioning: loyalty + rewards lead; campaigns + groups as top selling points.

### Phase 1 — Fix what's flat-out wrong (no design changes, copy-only)
Highest priority: page currently states things the product no longer does.
- [ ] `QrLoyalty.tsx` + `translations.ts`: rewrite QR flow to the unified visit scan
      ("Staff scans your QR → visit + reward applied in one tap"). Remove "staff approval code"
      and "phone login" steps.
- [ ] `Faq.tsx` / translations: fix FAQ #3 verification answer (remove approval codes).
- [ ] Audit all 7 FAQ answers + `Trust.tsx` cards against §1 reality; correct any others.
- [ ] Do this for **both `en` and `ru`** in `translations.ts`.

### Phase 2 — Fix links
- [ ] Add `VITE_APP_URL` to `landing/.env.example` (+ wire into a small `appUrl` helper, like
      `api.ts` reads `VITE_API_URL`). Prod value set in Railway/Vercel.
- [ ] Point "Explore Deals" / "Explore" CTAs at `${APP_URL}/nearby` — Header, Hero, FinalCta,
      MobileCta, Footer.
- [ ] Add a **Login** entry in Header: customer → `${APP_URL}/login`, business →
      `${APP_URL}/business/login`. Currently no way back in for existing users.
- [ ] Footer "Dashboard" → `${APP_URL}/business/login`; keep "Register" → `#register` lead form.
- [ ] Create `landing/public/privacy.html` + `terms.html`; footer Privacy/Terms link to them.
      No `#top` legal links.
- [ ] Footer social icons → real handles or remove.

### Phase 3 — Rebalance + add missing features (content + components)
Positioning: **loyalty + rewards first**, campaigns as a top selling point, group as one option.
- [ ] Hero: rewrite headline around loyalty/rewards outcome (e.g. "Earn rewards at your favorite
      local spots"), with group deals as a supporting line — not the whole pitch.
- [ ] Add/repurpose a section for **loyalty + voucher wallet** (stamp cards → banked rewards →
      redeem). Currently the wallet/voucher mechanic is invisible.
- [ ] Promote **Campaigns** to a headline pillar: visit / time-window / **group** as three
      flavors. Repurpose `DealsCarousel.tsx` / `ExampleCampaign.tsx` to show all three, not only
      group.
- [ ] Add **Nearby discovery** to customer benefits (map + categories) — real feature, unsold.
- [ ] Business section: surface **reports** (retention cohorts, staff performance) — strong B2B
      selling point that's currently absent.
- [ ] Keep "no app download" — still true and a genuine differentiator.

### Phase 4 — Appeal / polish
- [ ] Tighten hero value prop; lead with the customer outcome.
- [ ] Make the dashboard/campaign mockups reflect real screens (current ones are invented
      numbers; align labels with actual dashboard KPIs).
- [ ] Consider real screenshots of the customer app + business dashboard instead of
      hand-built HTML mockups, if assets are available.
- [ ] Verify `en` / `ru` parity after all copy changes.

### Phase 5 — Verify
- [ ] `pnpm` build of `landing/` passes.
- [ ] Manual pass: every link resolves (no `#top` placeholders), both languages render, mobile
      + desktop breakpoints (880 / 560) intact.
- [ ] Re-read every claim on the page against §1 reality — zero stale statements.

---

## 4. Quick-reference: files to touch
- Copy/claims: `landing/src/i18n/translations.ts` (en + ru), `landing/src/i18n/content.ts`
- QR flow: `landing/src/components/QrLoyalty.tsx`
- FAQ: `landing/src/components/Faq.tsx`
- Trust: `landing/src/components/Trust.tsx`
- Links/CTAs: `Header.tsx`, `Hero.tsx`, `FinalCta.tsx`, `MobileCta.tsx`, `Footer.tsx`
- New sections: `CustomerBenefits.tsx`, `BusinessBenefits.tsx`, `DealsCarousel.tsx`,
  `DashboardPreview.tsx`
- API base for lead form is fine: `landing/src/api.ts` → `/api/businesses/register-lead/`

## 5. Priority order
1. Phase 1 (wrong claims) — do first; it's misinformation.
2. Phase 2 (dead links) — credibility + conversion.
3. Phase 0 decisions unblock Phases 2–3.
4. Phase 3 (rebalance/missing) — biggest appeal lift.
5. Phase 4–5 (polish + verify).
