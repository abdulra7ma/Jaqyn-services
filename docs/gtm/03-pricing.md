---
title: GTM 03 — Pricing & Monetization Strategy
service: platform
type: strategy
status: active
last_reviewed: 2026-07-07
---

# Pricing & Monetization Strategy — Jaqyn

**Purpose.** Turn positioning (`01-positioning.md`) and market analysis
(`02-market-analysis.md`) into a launch-ready pricing decision: one model, a
concrete tier structure, a trial/pilot plan, launch tactics with hard dates, a
unit-economics sanity check, and the build checklist that makes any of it
chargeable. Decision-oriented. Every assumption is flagged.

**Evidence labels:** **[VERIFIED]** (codebase or cited source),
**[ESTIMATE]** (reasoned inference), **[ASSUMPTION]** (unconfirmed — a research
gap). USD→KGS ≈ 87; UDS Bishkek anchor ≈ 3,500 KGS/mo [VERIFIED reseller quote,
per `02-market-analysis.md`].

**Non-negotiable context (do not re-audit):** ZERO billing/payment code exists.
`Business` has `trial_started_at` / `trial_ends_at`; `SystemConfiguration.trial_period_days = 30`;
no plan enforcement, no gateway, all features free to all businesses today. Every
price below is a **hypothesis to validate with the founder-led cohort — do not
publish on the landing page yet** (positioning risk #4).

---

## 1. Recommended pricing model

### Decision: **flat monthly subscription per business, tiered, with an annual-prepay option. No permanent free tier.**

A single fixed price per business per month, in KGS, sits in the same category
box as the anchor (UDS ~3,500 KGS/mo) while reading as "same thing, better
value, your own brand, for less." It gives the owner-decider the one property
they need to say yes same-day: a **predictable, budgetable number** that clears
the positioning doc's "less than one day of revenue per month" bar [VERIFIED —
`01-positioning.md` ICP-A].

**Why this model, grounded in how value is delivered and how rivals charge:**

- Value accrues **per business, continuously** — the loyalty card, campaigns, and
  dashboard are always-on infrastructure for that one venue. That maps cleanly to
  a per-business recurring fee, not a per-event charge.
- The category's dominant model is **flat monthly SaaS per business** (UDS
  Lite/Pro, Telegram-bot tools) [VERIFIED — `02-market-analysis.md` §4.2].
  Matching the mental model the owner already has removes a translation step in
  the sale.
- Flat pricing lets Jaqyn **anchor visibly below UDS** and win on rows 3/4/5/6 of
  the differentiation map (retention habit, group acquisition, proof, own-brand)
  without entering the price war on row 1 it cannot win against free
  [VERIFIED — `02-market-analysis.md` §3].

### Alternatives considered and rejected (one line each)

- **Transaction / redemption fee** — rejected: Jaqyn is **not in the merchant's
  payment flow** (no POS, no money movement; the only "transaction" is a scan or
  voucher redemption). Metering scans would tax the exact behavior we're begging
  staff to do — it penalizes adoption.
- **Usage-based (per active customer / per scan)** — rejected: punishes success
  (a café that wins gets a surprise bill) and destroys the predictable number the
  owner-decider requires. Wrong incentive, wrong buyer.
- **Per-seat** — rejected as the *primary* meter: 3–15 staff [VERIFIED —
  `01-positioning.md`] is too small a range to price on. Seat count survives only
  as a **tier lever** (see §2), not the pricing axis.
- **Freemium (permanent free tier)** — rejected: its only real justification is
  seeding the empty Nearby map, and the docs are explicit that **discovery is not
  the headline at launch** (positioning risk #1). Free signals "no value" against
  a product whose whole thesis is "worth paying over free" [VERIFIED —
  `02-market-analysis.md` §4.3]. Replaced by a **time-boxed paid pilot** (§3).
- **License buyout (one-time buy, UDS-style)** — *partially* addressed, not
  adopted. The market doc flags that cash-heavy KG owners may prefer a one-time
  buy [VERIFIED — `02-market-analysis.md` §4.2]. **Answer: an annual-prepay
  discount, not a perpetual buyout.** A buyout kills recurring revenue and orphans
  the account from updates/support; an annual prepay captures the same
  "pay-once-and-forget" preference while keeping the relationship. Revisit a
  buyout only if annual prepay demonstrably fails to close cash-preferring owners.

---

## 2. Tier structure

**Two tiers at launch, plus a name-held third for later.** Two tiers keep the
sale simple for a same-day decider; the third exists on paper so the ladder has
somewhere to climb once salons/retail and social campaigns land.

All features below are the **real, shipped surface** named in `01-positioning.md`.
Gates are count-based (loyalty programs, campaigns, staff seats) plus feature
flags (group campaigns, tier/cashback ladder, analytics depth, gallery).

| Feature (real capability) | **Растём / "Grow"** | **Бизнес / "Business"** |
|---|---|---|
| Price [ESTIMATE — validate, do not publish] | **990 KGS/mo** | **1,990 KGS/mo** |
| Loyalty programs running at once (stamps / visit / points-cashback — multi-form loyalty, `apps/loyalty`) | up to **2** | **unlimited** |
| Branded wallet card + accent color (`Business.card_accent`) | ✅ | ✅ |
| Individual campaigns (visit-challenge / time-window, `apps/campaigns`) | up to **3 active** | **unlimited** |
| **Group "bring-friends" campaigns** (the wedge — invite links, check-in window, leader reward) | **1 active** | **unlimited** |
| Staff seats (scanner accounts, `apps/accounts` StaffMember) | up to **3** | up to **15** |
| Tier / cashback ladder (`LoyaltyTier` status ladder on points programs) | — | ✅ |
| Owner dashboard (scans, customers, redemption rate) | ✅ | ✅ |
| Per-campaign analytics (views / joins / completions / est. cost) | basic (joins + completions) | **full** (incl. estimated cost) |
| Gallery (business photo gallery on public profile) | up to **3 images** | **unlimited** |
| Public profile + Nearby map listing (`/c/[id]`, `/api/businesses/nearby/`) | ✅ | ✅ |
| Support | email / self-serve | priority (founder line during launch) |

**Note on the wedge (deliberate resolution of a real tension).** Group
bring-friends campaigns are the single uncontested differentiator
[VERIFIED — `02-market-analysis.md` §5], and they are *the demo that sells the
product*. Gating them out of the entry tier entirely would kill the sale.
Resolution: **entry tier gets 1 active group campaign** (enough to run and prove
the loop), **Business gets unlimited** (the owner who's seen it work now wants to
run several). The wedge is demonstrable on every plan; scale is the paid lever.

### Upgrade triggers (what pushes Grow → Business)

- **Hitting the group-campaign cap** — the owner ran one bring-friends campaign,
  saw it work in the dashboard, and wants to run a second concurrently. This is the
  primary, intended trigger: the wedge sells the upgrade.
- **Running a 3rd loyalty program** — multi-form loyalty is a stated selling point;
  a business layering stamps + points-cashback + a visit counter crosses the 2-program cap.
- **Wanting the tier/cashback status ladder** — `LoyaltyTier` is a Business-tier
  feature; salons/retail asking for "gold customer" status levels upgrade for it.
- **Adding a 4th staff seat** — a growing café or second location crosses 3 seats.
- **Wanting per-campaign cost analytics** — the owner who asks "did that promo pay
  off?" needs the full estimated-cost view (row 5 proof), which is Business-tier.

### The name-held third tier (do not build at launch)

**Сеть / "Network"** — multi-location roll-ups, cross-branch loyalty, and (once
shipped) social-follow campaigns (`apps/campaigns/services/social.py`, currently
half-built — positioning risk #7). Priced later, above Business. Named now so the
ladder is coherent; **excluded from all launch messaging.**

---

## 3. Trial / pilot strategy

### Decision: **founder-led paid pilot at a founding price, with a short time-boxed trial. No permanent free tier. Defer self-serve freemium.**

This is the section the docs pull hardest on, so the call is made explicitly:

- **Reject permanent free tier** — see §1. Its only justification (map density) is
  a deferred goal.
- **Reject broad self-serve trial at launch** — production blockers make it
  irresponsible: SMS/OTP is a dev stub and invite emails don't send in prod
  (positioning risk #5) [VERIFIED — `01-positioning.md`]. Self-serve signup can't
  work reliably until B01/SMS lands.
- **Adopt: founder-led, hand-held pilot.** For the first cohort (~the 120-lead
  café DB), the founder onboards each business personally, runs a live group
  campaign in the demo, and closes on a **founding price** (§4) billed by
  **manual invoice / bank transfer** — no gateway needed for cohort one.

**Trial mechanics for the cohort:**

- **Duration: keep the existing 30-day trial** (`trial_period_days = 30`,
  `apps/system`) as the value-proof window. Café frequency means a stamp card
  fills and a group campaign completes inside 30 days [VERIFIED —
  `02-market-analysis.md` §1.3] — the trial is long enough to show ROI and short
  enough to force a decision.
- **Current state, stated plainly:** the 30-day trial is **not enforced** — no
  billing code charges or restricts anything after day 30 (positioning risk #4).
  Every business is free-forever *in code* today. Enforcing expiry is a **build
  item** (§7 P0), not a fact on the ground.
- **Conversion mechanism:** at day ~21, the founder reviews the business's own
  dashboard *with* the owner — actual scans, actual campaign joins, actual
  repeat-visit lift — and converts on proof, not a paywall. The paywall
  (trial-expiry enforcement) is the backstop for when self-serve arrives, not the
  primary close for cohort one.
- **Fallback for slow-ROI segments:** salons (2–6 week cycle) may not prove out in
  30 days [VERIFIED — `02-market-analysis.md` §1.3]. Do not launch on them; if
  piloted, extend their trial to 60 days manually. Cafés stay on 30.

---

## 4. Launch pricing tactics (launch ~2026-08)

All offers carry **hard end dates** so scarcity is real and the price can reset.

- **Founding Customer program — "Основатели / Founders."** The first **25 paying
  businesses** (or all signed by **2026-10-31**, whichever first) lock a
  **founding rate of 690 KGS/mo (Grow) / 1,490 KGS/mo (Business)** — roughly
  **–30% vs. standard** — **for 12 months**, honored on manual invoice. In
  exchange: a testimonial and a case-study conversation. This both seeds proof and
  validates WTP with real money changing hands.
- **Early-adopter discount (post-Founders).** Businesses signing **2026-11-01
  through 2026-12-31** get **–20% for 6 months**. Cleanly time-boxed; ends
  2026-12-31.
- **Annual vs. monthly incentive (permanent).** **Annual prepay = 2 months free
  (≈ –17%).** This is the standing answer to cash-preferring, buyout-inclined KG
  owners (§1) — it captures "pay once, forget it" without a perpetual license.
  Applies on top of neither Founders nor early-adopter (one discount at a time;
  annual replaces, doesn't stack).
- **No public price until billing ships.** Landing page says **"30-day free
  trial"** only (positioning risk #4). Prices live in founder-led conversations
  and this doc until §7 P0/P1 land.

**Standard rack rates after all launch windows close (from 2027-01-01):**
Grow 990 KGS/mo, Business 1,990 KGS/mo [ESTIMATE — validate with cohort revenue].

---

## 5. Local-market adaptation

- **Launch: KGS only.** All prices, invoices, and the (future) checkout are in
  som. No multi-currency at launch — it's complexity with zero near-term payoff
  given a Bishkek-only beachhead.
- **Language:** pricing/billing copy is **RU-first** (matches the app,
  `frontend/packages/i18n`, RU/EN only today). Kyrgyz billing copy is a fast-follow
  with the broader KY gap [VERIFIED — positioning risk #6].
- **Regional expansion (KZ / UZ) — operational plan, not a launch item
  [ASSUMPTION on demand]:** when it comes, handle it as **per-region price books
  keyed off the business's country**, not a live FX conversion. Store a
  `currency` + `region` on the plan/subscription, set a deliberate local price per
  region (a KZT price is a *pricing decision*, not `KGS × rate`), and invoice in
  the local currency via a local acquirer. FreedomPay's group operates across the
  region (Kazakhstan-adjacent), which eases the gateway story if/when expansion
  happens. **Do not** build multi-region until a second market is a committed
  decision — a `currency` column on the subscription model is the only forward
  hook worth adding now (§7).

---

## 6. Unit-economics sanity check

All figures are **rough, order-of-magnitude, and explicitly assumption-laden** —
the point is to confirm the model isn't upside-down, not to forecast.

**Revenue per customer (per business/mo):**
- Grow standard 990 KGS; Business standard 1,990 KGS. Founding rate 690 / 1,490.
- [ASSUMPTION] launch mix skews Grow → blended **≈ 900–1,200 KGS/mo** per paying
  business at founding rates; **≈ 1,200–1,500 KGS/mo** at standard rates.

**Cost to serve (per business/mo):**
- **Infra:** Railway total is **< ~1,300 KGS/mo (~$15)** for the *entire platform*
  today [VERIFIED — `AGENTS.md` / DEPLOY]. Amortized across even 30 businesses
  that's **< ~45 KGS/business/mo** — effectively free at this scale.
- **SMS OTP — variable *and* deferrable, not a flat line (the number people get
  wrong):** SMS cost scales with the *merchant's customers* signing up (hundreds
  of customers ⇒ hundreds of OTPs), **not** per business. KG SMS ≈ **1–2 KGS/msg**
  [ESTIMATE — mark to real provider quote]. A café onboarding 300 customers in a
  season ⇒ ~300–600 KGS one-off, spread over months. **And it's contingent:** the
  launch cohort can use **email OTP** and avoid SMS entirely (open question #6) —
  so for cohort one, model SMS as **~0**, appearing only when self-serve phone
  signup ships.
- **Net:** at ~900+ KGS revenue vs. < ~100 KGS blended serve cost, **gross margin
  per business is high (>85%)** even generously loading SMS. The model is not
  upside-down; the constraint is *acquisition*, not *serve cost*.

**Cost to acquire (founder-led — opportunity cost, not cash):**
- CAC at launch is **founder time**, not ad spend. [ASSUMPTION] ~**3–5 hours** to
  research, pitch, demo, onboard, and close one café (hand-held per risk #5).
- At a notional founder rate of, say, **1,000 KGS/hr** [ASSUMPTION — opportunity
  cost placeholder], that's **~3,000–5,000 KGS of founder time per closed
  business** — i.e. **3–5 months of that customer's subscription** just to acquire
  them.
- **Implication:** payback on founder time is **months, not weeks**, and only
  works because there's no cash CAC and the serve cost is trivial. This *confirms*
  the market doc's framing: near-term this is a **validation-stage revenue base**
  (50–300 businesses), not a venture-scale motion [VERIFIED —
  `02-market-analysis.md` §1.2]. Founder-led is viable precisely because margins
  are fat and infra is nearly free — but it does **not** scale past the founder's
  hours without self-serve (which needs SMS + billing, §7).

**Headline:** unit economics are healthy per-account; the binding constraint is
founder-hour throughput, not price or cost-to-serve. Price to validate WTP, not to
cover costs (costs are already covered many times over).

---

## 7. Technical build checklist

Priorities: **P0** = required before charging the first ruble; **P1** = required
before self-serve; **P2** = scale/expansion.

### Billing provider choice (the KG reality)

- **Stripe is NOT available in Kyrgyzstan** [VERIFIED]. Do not design around it.
- **Cohort one (now → billing ships): manual invoicing / bank transfer.** No
  gateway needed to charge the first 25 businesses. Founder issues an invoice
  (счёт / счёт-фактура), owner pays by bank transfer or in cash-equivalent; the
  subscription is toggled active by hand in the admin. **P0.**
- **Self-serve gateway: FreedomPay Kyrgyzstan (`freedompay.kg`)** [VERIFIED — it
  offers recurring/autopayments, online invoicing, and API/plugin integration;
  accepts Visa/Mastercard/Elcart + O!Dengi/MegaPay/Balance wallets]. This is the
  recommended PSP when self-serve arrives. **P1.** Local wallet rails (MBank/ELQR,
  Elcart) reach the customer, but for *merchant SaaS billing* FreedomPay's
  recurring-payment + invoicing product is the fit.

### Checklist

**P0 — before charging anyone:**
- [ ] **Plan / subscription model.** Add a `Plan` (name, price, currency,
      feature limits) and a `Subscription` on `Business` (plan, status,
      `current_period_end`, billing mode). Include a `currency` field now as the
      only forward hook for regional expansion (§5). *(`apps/system` or a new
      `apps/billing`.)*
- [ ] **Entitlement checks in the service layer, NOT views** [VERIFIED —
      `backend.md`: "views hold zero business logic"]. Enforce caps at
      **creation time** in the owning services:
      - loyalty-program create → check program count vs. plan (`apps/loyalty`).
      - campaign create → check individual/group campaign caps (`apps/campaigns`).
      - staff-seat add → check seat cap (`apps/accounts`).
      - `LoyaltyTier` / gallery-image add → feature-flag / count gate.
      Raise a domain `PermissionDeniedError` / `ConflictError`; the existing DRF
      exception handler maps it to HTTP. No view-level branching.
- [ ] **Trial-expiry enforcement.** Today `trial_ends_at` is decorative. Add a
      check (middleware or a service guard) that, past trial with no active
      subscription, restricts write actions (campaign/loyalty create, staff scan
      is the sensitive one — decide whether scanning degrades). Celery daily sweep
      to flip expired trials to a `past_due` state (idempotent, id-based, per
      `backend.md` Celery rules).
- [ ] **Manual invoicing + legal entity.** A **registered KG legal entity is
      required to issue invoices** (счёт-фактура) and collect payment [VERIFIED —
      MEMORY: KG legal/registration filings]. Confirm entity + tax registration
      (ГНС) is complete before invoicing cohort one. Template a compliant
      счёт-фактура.

**P1 — before self-serve:**
- [ ] **FreedomPay integration** — recurring payment setup + online invoicing via
      their API; webhook to activate/deactivate the `Subscription`. Wrap all
      subscription state writes in `transaction.atomic`; fire side effects via
      `transaction.on_commit` (`backend.md`).
- [ ] **Self-serve upgrade/downgrade** UI + plan-change proration policy (or
      simplest: change takes effect next period, no proration).
- [ ] **Dunning.** On failed recurring charge: retry schedule, RU-first dunning
      emails (requires the email path fixed — positioning risk #5), grace period,
      then downgrade/suspend. Idempotent Celery tasks with `max_retries` +
      `retry_backoff`.
- [ ] **SMS OTP provider** (B01) — unblocks phone self-signup; adds the variable
      SMS cost from §6.
- [ ] **Billing admin surface** — the Django admin (django-unfold) already hosts
      onboarding; add subscription status/override there.

**P2 — scale / expansion:**
- [ ] **Per-region price books** keyed off business country (§5) — only when a
      second market is committed. The `currency` column from P0 is the seam.
- [ ] **Annual-prepay handling** in the gateway flow (2-months-free logic).
- [ ] **Usage metering for analytics only** (not billing) — to inform later
      pricing, track scans/campaign-joins per business.

---

## Assumptions & open questions (flagged)

1. **[ASSUMPTION — the biggest one] Willingness to pay is unresearched.** No
   pricing study exists and no billing code constrains the answer (positioning
   risk #4). Every price here (990 / 1,990; founding 690 / 1,490) is a
   **hypothesis in the doc's 800–2,500 KGS band, visibly below UDS's ~3,500**
   [VERIFIED anchor]. **Validate with the founder-led cohort; do not publish
   until proven.**
2. **[ESTIMATE] KG SMS cost ~1–2 KGS/msg** — replace with a real provider quote
   when B01 lands.
3. **[ASSUMPTION] Founder-hour CAC (~3–5 hrs, ~1,000 KGS/hr opportunity cost)** —
   placeholder to make payback honest, not a measured figure.
4. **[ASSUMPTION] Feature-tier boundaries** (which exact cap sits where) are a
   pricing hypothesis; the *features* are real [VERIFIED — `01-positioning.md`],
   the *gating lines* are a design choice to test against upgrade behavior.
5. **[ASSUMPTION] Regional (KZ/UZ) demand** — expansion pricing is a
   contingency plan, not a committed roadmap item.
