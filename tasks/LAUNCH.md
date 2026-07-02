# Launch Readiness — Top 10

Goal: everything here done → start walking into businesses.
Order = priority. 1–5 are product blockers, 6–10 are go-to-market.

## 1. Consolidate branches → one deployable main
8 feature branches exist; several built-but-unmerged/uncommitted
(`staff-app-handoff` in progress, `multi-form-loyalty`, `loyalty-business-design`,
`email-signup-otp`, `trial-and-demo-accounts`, onboarding email flow, landing consent).
- [ ] Finish + merge `feat/staff-app-handoff`
- [ ] Merge or kill each remaining branch — no half-shipped state at launch
- [ ] `main` = exactly what customers get

## 2. Deploy to production (Railway)
Per DEPLOY.md: backend + Celery + Postgres + Redis + frontend + landing + R2.
- [ ] Real domain + HTTPS (camera/QR scanning REQUIRES https)
- [ ] Env vars set, `DEBUG=False`, migrations run
- [ ] FRONTEND_URL points at prod so QR tokens resolve to prod
- [ ] Email sending works in prod (activation + OTP emails — Mailpit is local-only)

## 3. Russian i18n complete
Bishkek customers + staff read Russian. Audit every user-facing surface via
`@jaqyn/i18n`: customer app, staff app, business app, landing, emails, error toasts.
- [ ] RU 100% on customer + staff surfaces (the two that face strangers)
- [ ] Kyrgyz = later, not a launch blocker

## 4. E2E pass on the 3 money journeys (on prod)
Scripted manual pass minimum; Playwright where cheap.
- [ ] Customer: signup (phone + email OTP) → scan QR at counter → earn stamp/points → redeem reward → welcome voucher
- [ ] Staff: login → unified scan (loyalty + campaign + voucher QRs) → collect → redeem
- [ ] Business: activation email → onboarding → create campaign → see scans/stats
- [ ] Unhappy paths: camera denied, bad QR, expired voucher, double-scan

## 5. Trial + pricing decided and wired
Trial fields + demo seeding already built.
- [ ] Pick numbers: e.g. 3 months free → flat monthly price in som (one number, no tiers at launch)
- [ ] Define trial-end behavior: grace period → read-only lock (never delete data)
- [ ] Payment collection = manual invoice/transfer at first. No payment integration for launch.
- [ ] One-page price sheet (RU) for the pitch

## 6. QR print materials
- [ ] QR generator: Jaqyn logo centered — use error correction level H (30% recovery) so logo doesn't break scans
- [ ] Table tent + till sticker template (design-system colors, RU copy)
- [ ] Print test: scan from paper at 0.5–1m, dim café light, mid-range Android
- [ ] Per-business generation script (business QR → its /q/{token} URL)

## 7. Target list — one district
- [ ] Pick district (density > coverage)
- [ ] 2GIS scrape: ~50 cafés/salons/barbershops → sheet: name, address, Instagram, phone, owner if known
- [ ] Mark 3 anchor candidates (high traffic, offer free-forever)

## 8. Pitch kit + onboarding runbook
- [ ] Demo business seeded on prod (admin one-click) — pitch from live phone, not slides
- [ ] Pitch script (RU): "верните постоянных клиентов" — retention, not acquisition
- [ ] Concierge runbook: you create account → configure campaign → deliver printed QR → 10-min staff training
- [ ] Staff cheat-sheet, one laminated page (RU)
- [ ] Telegram support channel template per business

## 9. Legal minimum (KG)
- [ ] Entity registration (Минюст) + tax (ГНС)
- [ ] Personal-data operator notification
- [ ] Privacy + terms reviewed by counsel (current landing text is placeholder-grade)

## 10. Ops floor
- [ ] Error monitoring (Sentry — free tier) on backend + frontend
- [ ] Automated Postgres backups on Railway, restore tested once
- [ ] Uptime ping (UptimeRobot free) on API + frontend
- [ ] You get notified when a business has 0 scans in 7 days (dead-account signal — even a weekly admin query is enough)
