# Multi-form Business Loyalty — Design Spec

**Date:** 2026-06-28
**Builds on:** `2026-06-26-campaigns-restructure-design.md` (unified Campaign model)
**Status:** Approved — build in 3 slices.

## Summary

A business can run **multiple loyalty programs at once**, each a different form,
all as `INDIVIDUAL` campaigns under the unified model:
- **Points → cashback**: customer accrues points (basis chosen by business: per
  visit or per spend), redeemable as cashback (som off).
- **Visits/stamp → discount or free item**: on completion the customer gets a
  discount or an item from the business's menu/services (`CatalogItem`); the item
  is either business-preset or customer-chosen (business decides per program).

The customer sees **all** of a business's loyalty programs and their own progress
on each in a **dedicated "Loyalty" section on the business page** (`/nearby/[id]`),
and across businesses in the Rewards tab "In progress" row.

## Locked decisions
- Points accrual: **business chooses** per-visit (fixed) or per-spend (rate) per program.
- Item reward: **business chooses** fixed item or customer-chosen per program.
- Points→cashback is a **balance** model (accrues, spent as cashback) — not the
  reach-a-target-mint-a-voucher loop.

## Slice 1 — Backend (`apps/campaigns`)

**`CampaignRule`** (mechanic gains `POINTS`):
- `points_basis`: `visit | spend` (nullable; POINTS only)
- `points_per_visit`: PositiveInt (nullable) — visit basis
- `points_per_som`: Decimal (nullable) — spend basis
- `cashback_per_point`: Decimal (nullable) — som per point at redemption

**`CampaignReward`** (reward_type gains `CASHBACK`):
- `item_selection`: `fixed | customer` (nullable; FREE_ITEM/DISCOUNT item programs)
- `catalog_item`: FK→`businesses.CatalogItem` (nullable; set when fixed)

**`CampaignParticipant`**:
- `points_balance`: PositiveInt default 0 (POINTS programs)

**`CampaignRewardVoucher`**:
- `catalog_item`: FK→`CatalogItem` (nullable; chosen/preset item)
- `cashback_amount`: Decimal (nullable; CASHBACK vouchers)

**Services**
- Progress: a confirmed action on a POINTS campaign adds points to
  `points_balance` — visit basis → `points_per_visit`; spend basis →
  `points_per_som × amount_spend` (staff enters bill, reuses SPEND path). POINTS
  campaigns never auto-complete.
- Redeem points → cashback: `redeem_points(campaign, customer, points)` validates
  balance, mints a `CASHBACK` voucher `cashback_amount = points × cashback_per_point`,
  deducts balance under `select_for_update`. Staff redeems the voucher as money off.
- Item reward on completion: `fixed` → voucher.catalog_item = rule item;
  `customer` → voucher.catalog_item null until the customer selects a CatalogItem
  at present time (`select_voucher_item(voucher, item)`).
- Domain exceptions for insufficient points / invalid item / not-eligible.

**API**
- `POST /customer/campaigns/{id}/redeem-points/` `{points}` → cashback voucher.
- `POST /customer/campaign-vouchers/{id}/select-item/` `{catalog_item_id}` (customer-choice).
- `GET /customer/businesses/{id}/loyalty/` → the business's active INDIVIDUAL
  programs + this customer's progress/points on each (backs the business-page section).
- `GET /customer/campaigns/{id}/catalog/` → eligible CatalogItems for item selection.
- Business create/detail serializers expose the new rule/reward fields.

**Tests**: points accrual (visit + spend basis), redeem-points (success +
insufficient), item reward fixed vs customer-choice select, business loyalty
list query-count, auth/permission/happy-path on new endpoints. Suite stays green.

## Slice 2 — Business page loyalty section (`/nearby/[id]`)

A **"Loyalty / Лояльность"** section listing every active loyalty program of the
business with the customer's state:
- points program → balance + "Redeem cashback" (when ≥ min)
- visit/stamp program → X/Y progress bar + reward line
- spend program → spend progress
Each row joins/continues into the campaign detail. Reuses progress-card styling;
copy via `@jaqyn/i18n` (EN+RU).

## Slice 3 — Create flow + customer redemption

- Business create form: POINTS option (basis toggle + per-visit/per-som + cashback
  rate) and item-reward selection (fixed `CatalogItem` picker vs customer-choice).
- Customer: points card shows balance + redeem-cashback action; item reward →
  pick-from-menu sheet at redemption. Surface in Rewards "In progress" + business page.

## Out of scope (now)
- Points expiry, tiered cashback, partial-points redemption UI beyond a simple amount.
