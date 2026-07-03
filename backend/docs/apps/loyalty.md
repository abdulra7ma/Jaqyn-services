---
title: loyalty app
service: backend
type: reference
status: active
last_reviewed: 2026-07-03
---

# loyalty

Standing loyalty programs (separate from time-boxed campaigns). A business can
run several programs at once.

**Models** (`models.py`): `LoyaltyProgram` (type = points/stamp/visit, with
points-basis, cashback, reward config), `LoyaltyMembership` (per
customer+program balances), `LoyaltyTransaction` (earn/redeem/adjust/reverse
ledger), `LoyaltyVoucher`. See `data-model.md`.

**Key services** (`services/` package):
- `program.py` — program create / pause / activate / archive.
- `membership.py` — customer join, card/wallet views.
- `earning.py` — staff award (points by visit/spend, stamps, visits) writing a
  `LoyaltyTransaction` and advancing the membership.
- `redemption.py` — redeem points / stamps to a voucher, voucher redeem, item
  selection.
- `analytics.py` — program analytics.
- `home.py` — customer visit streak, active-card count, earned reward count,
  redeemed savings total, and composition of the campaign service's ranked
  home-campaign ids. Reward totals include both loyalty and campaign vouchers;
  cancelled vouchers are excluded and savings are recognized on redemption.
- `scan.py` / `scan_views.py` — `UnifiedStaffScanView` at `/api/staff/scan/`
  (high-throughput till scanner that auto-routes by scanned QR type).

**Endpoints:** `/api/business/loyalty/programs/…`, `/api/customer/loyalty/`
(home-summary, cards, join, redeem-points, catalog, vouchers, per-business loyalty),
`/api/staff/loyalty/` (award, redeem-voucher). See `api.md`.

**Responsibilities:** program setup and lifecycle, membership balance tracking,
earning logic per program type, point/stamp redemption to vouchers, and the
unified staff scan entry point.

Customer card projections include `min_redeem_points`. Cashback readiness and
progress UI must use that owner-configured threshold and never invent a display
percentage when the business has not configured one.
