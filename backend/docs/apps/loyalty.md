---
title: loyalty app
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

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
- `scan.py` / `scan_views.py` — `UnifiedStaffScanView` at `/api/staff/scan/`
  (high-throughput till scanner that auto-routes by scanned QR type).

**Endpoints:** `/api/business/loyalty/programs/…`, `/api/customer/loyalty/`
(cards, join, redeem-points, catalog, vouchers, per-business loyalty),
`/api/staff/loyalty/` (award, redeem-voucher). See `api.md`.

**Responsibilities:** program setup and lifecycle, membership balance tracking,
earning logic per program type, point/stamp redemption to vouchers, and the
unified staff scan entry point.
