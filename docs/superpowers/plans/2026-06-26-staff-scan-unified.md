# Staff Scan — Unified One-Scan Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One staff scan auto-routes by QR type — a customer QR previews then advances the loyalty card + the right set of campaigns on a single confirm tap; a voucher QR previews then redeems on confirm — and the result card renders above the bottom nav.

**Architecture:** Add one read-only backend resolve endpoint (`POST /api/staff/campaigns/scan/`) that tags a token `customer`/`voucher`/`invalid` and returns the matching preview. The frontend drops its visit/redeem mode toggle and branches on that tag. The existing apply endpoints (`/visit/`, `/redeem-voucher/`) are unchanged except `confirm_visit_unified` now advances the loyalty card + all eligible `allow_multiple_campaign_counting` campaigns + one prioritized default campaign, returning a list of outcomes.

**Tech Stack:** Django 5 + DRF + pytest (`pytest-django`) backend; Next.js 14 + React 18 + TypeScript + TanStack Query + Vitest/RTL frontend. Design + ADR: `docs/superpowers/specs/2026-06-26-staff-scan-unified-design.md`.

---

## File Structure

Backend (`backend/apps/campaigns/`):
- `services/scanner.py` — reshape `UnifiedScanResult`, add `SkippedCampaign` + `ScanDispatch` dataclasses, rewrite `confirm_visit_unified` campaign leg, add `resolve_scan`.
- `serializers.py` — `ScanDispatchSerializer`; update `UnifiedScanResultSerializer`.
- `views/staff_views.py` + `staff_urls.py` — `ScanDispatchView` at `campaigns/scan/`.
- `tests/helpers.py` — add `allow_multiple` param to `make_campaign`.
- `tests/test_unified_scan.py` — migrate existing assertions to the list shape; add stacking/min-gap tests.
- `tests/test_scanner.py` / `tests/test_api.py` — `resolve_scan` service + endpoint tests.

Frontend:
- `packages/api/src/staff/types.ts` — reshape `UnifiedScanResult`; add `ScanDispatchResult`.
- `packages/api/src/staff/adapters.ts` — reshape `adaptUnifiedScan`; add `adaptScanDispatch`.
- `packages/api/src/staff/api.ts` + `hooks.ts` — add `resolveScan` + `useResolveScan`.
- `apps/web/app/staff/scan/page.tsx` — remove mode toggle, single resolve-then-branch flow, multi-campaign result rendering, z-index/padding fix.
- `packages/i18n/src/<locale files>` — new copy keys.

---

## Task 1: Test helper — campaigns can opt into stacking

**Files:**
- Modify: `backend/apps/campaigns/tests/helpers.py:64-118`

- [ ] **Step 1: Add the `allow_multiple` parameter and wire it onto the model**

In `make_campaign`, add a keyword parameter and set it on the created campaign. Change the signature line and the `Campaign.objects.create(...)` call.

Add to the signature (after `auto_join: bool = True,`):

```python
    allow_multiple: bool = False,
```

Add to the `Campaign.objects.create(...)` kwargs (after `auto_join_enabled=auto_join,`):

```python
        allow_multiple_campaign_counting=allow_multiple,
```

- [ ] **Step 2: Verify nothing broke**

Run: `cd backend && pytest apps/campaigns/tests/test_unified_scan.py -q`
Expected: PASS (existing tests still green — new param defaults to current behavior).

- [ ] **Step 3: Commit**

```bash
git add backend/apps/campaigns/tests/helpers.py
git commit -m "test: let make_campaign opt into allow_multiple_campaign_counting"
```

---

## Task 2: Reshape `UnifiedScanResult` to a list of campaign outcomes

This is the core backend change. `confirm_visit_unified` advances the loyalty card + every eligible stacking campaign + one prioritized default campaign, and returns lists.

**Files:**
- Modify: `backend/apps/campaigns/services/scanner.py:57-81` (dataclasses), `:227-314` (`confirm_visit_unified`)
- Test: `backend/apps/campaigns/tests/test_unified_scan.py`

- [ ] **Step 1: Write the failing tests (new behavior)**

Append to `backend/apps/campaigns/tests/test_unified_scan.py`:

```python
def test_stacking_campaigns_all_advance_in_one_scan():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    # Two opt-in (stacking) campaigns + one default campaign.
    c1 = make_campaign(business, required_count=3, allow_multiple=True)
    c2 = make_campaign(business, required_count=3, allow_multiple=True)
    c3 = make_campaign(business, required_count=3, allow_multiple=False)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    advanced_ids = {pr.campaign.id for pr in result.campaigns}
    # Both stacking campaigns advance; exactly one default campaign advances.
    assert c1.id in advanced_ids
    assert c2.id in advanced_ids
    assert c3.id in advanced_ids  # the only default → it is the chosen one
    assert len(result.campaigns) == 3
    assert result.skipped_campaigns == []


def test_only_one_default_campaign_advances():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    # Two default (non-stacking) campaigns → only one may count this visit.
    make_campaign(business, required_count=3, allow_multiple=False)
    make_campaign(business, required_count=3, allow_multiple=False)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    assert len(result.campaigns) == 1


def test_min_gap_on_one_campaign_does_not_block_others():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    # Two stacking campaigns; pre-advance c_blocked so its min-gap blocks a
    # second visit within the default window, while c_open still advances.
    c_blocked = make_campaign(business, required_count=5, allow_multiple=True)
    c_open = make_campaign(business, required_count=5, allow_multiple=True)
    StaffScannerService.confirm_visit(staff, c_blocked.id, customer)
    token = get_or_create_customer_profile_token(customer)

    result = StaffScannerService.confirm_visit_unified(staff, token.token)

    advanced_ids = {pr.campaign.id for pr in result.campaigns}
    skipped_ids = {sc.campaign_id for sc in result.skipped_campaigns}
    assert c_open.id in advanced_ids
    assert c_blocked.id in skipped_ids
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && pytest apps/campaigns/tests/test_unified_scan.py -k "stacking or one_default or min_gap_on_one" -q`
Expected: FAIL — `UnifiedScanResult` has no attribute `campaigns` / `skipped_campaigns`.

- [ ] **Step 3: Add the `SkippedCampaign` dataclass and reshape `UnifiedScanResult`**

In `scanner.py`, replace the `UnifiedScanResult` dataclass (lines 57-81) with:

```python
@dataclass(frozen=True)
class SkippedCampaign:
    """A campaign that was a candidate this scan but did not advance (§14).

    ``reason_code`` is the domain error code from the eligibility/fraud gate
    (e.g. ``CAMPAIGN_MIN_GAP``) so the staff UI and audit log can explain the gap.
    """

    campaign_id: str
    name: str
    reason_code: str


@dataclass(frozen=True)
class UnifiedScanResult:
    """Result of a single staff scan that advances loyalty + campaigns (§14).

    One staff action drives independent legs:

    * ``loyalty`` — the baseline leg, always attempted. Holds the
      ``staff_collect`` result dict on success, else ``None`` with
      ``loyalty_skipped_reason`` carrying the domain error code.
    * ``campaigns`` — every campaign that advanced this scan: all eligible
      campaigns with ``allow_multiple_campaign_counting`` set, plus the single
      prioritized eligible default campaign (one visit, one default stamp). Each
      element is a :class:`~apps.campaigns.services.progress.ProgressResult`.
    * ``skipped_campaigns`` — campaigns that were candidates but were blocked
      (e.g. min-gap), each carrying its reason code.

    The legs are independent: no leg's failure aborts another. Only an invalid /
    non-CUSTOMER_PROFILE token hard-fails (raised before this is built).
    """

    customer: object
    loyalty: dict | None
    loyalty_skipped_reason: str | None
    campaigns: list[ProgressResult]
    skipped_campaigns: list[SkippedCampaign]
```

- [ ] **Step 4: Rewrite the campaign leg of `confirm_visit_unified`**

In `confirm_visit_unified`, replace the campaign-leg block (lines 284-314, from the `# --- CAMPAIGN leg` comment through the `return UnifiedScanResult(...)`) with:

```python
        # --- CAMPAIGN leg (conditional) -------------------------------------
        # One visit advances: every eligible campaign that opts into stacking
        # (allow_multiple_campaign_counting), plus exactly one prioritized
        # eligible *default* campaign (§14 — a visit counts toward one default
        # campaign unless the business opted that campaign into stacking). A
        # tapped campaign_id forces the single default slot.
        campaigns: list[ProgressResult] = []
        skipped: list[SkippedCampaign] = []

        results = CampaignEligibilityService.eligible_campaigns_for_customer(
            staff.business, customer.id, now
        )
        eligible = [r for r in results if r.eligible]

        if campaign_id is not None:
            # Explicit single-target contract: advance only the tapped campaign.
            target_ids = [campaign_id]
        else:
            stacking_ids = [
                r.campaign.id
                for r in eligible
                if r.campaign.allow_multiple_campaign_counting
            ]
            default_results = [
                r for r in eligible if not r.campaign.allow_multiple_campaign_counting
            ]
            chosen_default = CampaignProgressService.resolve_priority_campaign(
                default_results, now=now
            )
            target_ids = list(stacking_ids)
            if chosen_default is not None:
                target_ids.append(chosen_default.id)

        # Map id → name for skipped reporting without a second query.
        name_by_id = {r.campaign.id: r.campaign.name for r in results}
        for target_id in target_ids:
            try:
                campaigns.append(
                    StaffScannerService.confirm_visit(
                        staff, target_id, customer, request=request, now=now
                    )
                )
            except JaqynAPIException as exc:
                skipped.append(
                    SkippedCampaign(
                        campaign_id=str(target_id),
                        name=name_by_id.get(target_id, ""),
                        reason_code=exc.code,
                    )
                )

        return UnifiedScanResult(
            customer=customer,
            loyalty=loyalty,
            loyalty_skipped_reason=loyalty_skipped_reason,
            campaigns=campaigns,
            skipped_campaigns=skipped,
        )
```

Also update the `confirm_visit_unified` docstring's CAMPAIGN-leg paragraph (lines 247-254) to describe the stacking-set + one-default rule (docstring-and-code-never-drift rule):

```python
        CAMPAIGN leg (conditional): advances every eligible campaign that opts
        into ``allow_multiple_campaign_counting`` plus the single prioritized
        eligible default campaign (§14). An explicit ``campaign_id`` overrides
        this and targets only that campaign. Each advance runs its own
        atomic/lock seam via :meth:`confirm_visit`; a campaign blocked by the
        eligibility/fraud gate is recorded in ``skipped_campaigns`` and never
        aborts the others or the loyalty award.
```

- [ ] **Step 5: Migrate the existing singular-shape assertions**

The existing tests assert `result.campaign` / `result.campaign_skipped_reason`. Update them to the list shape:

In `test_one_scan_advances_both_loyalty_and_campaign`, replace the campaign block:

```python
    # Campaign advanced.
    assert len(result.campaigns) == 1
    assert result.campaigns[0].campaign.id == campaign.id
    assert result.campaigns[0].progress_count == 1
    assert result.skipped_campaigns == []
```

In `test_loyalty_only_when_no_eligible_campaign`:

```python
    assert result.campaigns == []
    assert result.skipped_campaigns == []
```

In `test_campaign_only_when_no_active_loyalty_program`:

```python
    assert len(result.campaigns) == 1
    assert result.campaigns[0].progress_count == 1
```

In `test_campaign_completion_in_unified_scan_issues_voucher`:

```python
    assert len(result.campaigns) == 1
    assert result.campaigns[0].completed is True
    assert result.campaigns[0].voucher is not None
```

In `test_time_window_ineligible_campaign_still_awards_loyalty`:

```python
    assert result.campaigns == []
    assert len(result.skipped_campaigns) == 1
```

- [ ] **Step 6: Run the full unified-scan suite**

Run: `cd backend && pytest apps/campaigns/tests/test_unified_scan.py -q`
Expected: PASS (migrated + new tests all green).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/campaigns/services/scanner.py backend/apps/campaigns/tests/test_unified_scan.py
git commit -m "feat: unified scan advances stacking campaigns + one default campaign"
```

---

## Task 3: Read-only `resolve_scan` dispatch service

**Files:**
- Modify: `backend/apps/campaigns/services/scanner.py` (add `ScanDispatch` dataclass + `resolve_scan` method)
- Test: `backend/apps/campaigns/tests/test_scanner.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/campaigns/tests/test_scanner.py` (mirror its existing imports — it already imports `StaffScannerService`, the helpers, and `get_or_create_customer_profile_token`; add `CampaignProgressService` and `CampaignRewardVoucher` if not present):

```python
def test_resolve_scan_customer_token_returns_customer_kind():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_campaign(business, required_count=3)
    token = get_or_create_customer_profile_token(customer)

    dispatch = StaffScannerService.resolve_scan(staff, token.token)

    assert dispatch.kind == "customer"
    assert dispatch.customer_result is not None
    assert dispatch.customer_result.customer.id == customer.id
    assert dispatch.voucher is None


def test_resolve_scan_voucher_token_returns_voucher_kind():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    # Complete the campaign to mint an ACTIVE voucher with a QR token.
    result = StaffScannerService.confirm_visit(staff, campaign.id, customer)
    voucher = result.voucher
    assert voucher is not None and voucher.qr_token is not None

    dispatch = StaffScannerService.resolve_scan(staff, voucher.qr_token.token)

    assert dispatch.kind == "voucher"
    assert dispatch.voucher is not None
    assert dispatch.voucher.id == voucher.id


def test_resolve_scan_redeemed_voucher_returns_invalid_kind():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    voucher = StaffScannerService.confirm_visit(staff, campaign.id, customer).voucher
    CampaignRewardService.redeem_reward_voucher(staff, token=voucher.qr_token.token)

    dispatch = StaffScannerService.resolve_scan(staff, voucher.qr_token.token)

    assert dispatch.kind == "invalid"
    assert dispatch.reason_code == "VOUCHER_ALREADY_REDEEMED"
```

Ensure the test module imports `CampaignRewardService` (`from apps.campaigns.services import StaffScannerService, CampaignRewardService`).

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest apps/campaigns/tests/test_scanner.py -k resolve_scan -q`
Expected: FAIL — `StaffScannerService` has no `resolve_scan`.

- [ ] **Step 3: Add the `ScanDispatch` dataclass**

In `scanner.py`, after the `CustomerScanResult` dataclass (line 94), add:

```python
@dataclass(frozen=True)
class ScanDispatch:
    """Read-only routing result for a single staff scan (unified scanner).

    ``kind`` tags how the frontend should route the scan. Exactly one payload is
    set per kind: ``customer_result`` for ``"customer"``, ``voucher`` for
    ``"voucher"``, ``reason_code`` for ``"invalid"`` (the typed voucher error or
    ``INVALID_QR_TOKEN``). No writes happen while resolving — the apply step is a
    separate, explicit staff confirm.
    """

    kind: str  # "customer" | "voucher" | "invalid"
    customer_result: CustomerScanResult | None = None
    voucher: CampaignRewardVoucher | None = None
    reason_code: str | None = None
```

- [ ] **Step 4: Add the `resolve_scan` method**

In `scanner.py`, add this static method to `StaffScannerService` (place it after `scan_customer_qr`, before `confirm_visit`):

```python
    @staticmethod
    def resolve_scan(
        staff: StaffMember, raw_token: str, request=None, now: datetime | None = None
    ) -> ScanDispatch:
        """Resolve a scanned token to a routing tag without writing (unified scan).

        The unified scanner replaced the manual visit/redeem mode toggle: a token
        is opaque to the client, so this read-only resolve tells the frontend
        which preview to open. Resolves via ``resolve_qr_token`` (audit action
        ``staff_scan_resolve``), guards the business is active, then dispatches:

        * ``CUSTOMER_PROFILE`` → ``kind="customer"`` carrying the same
          :class:`CustomerScanResult` (eligible-campaign rows) the collect
          preview renders.
        * ``CAMPAIGN_REWARD`` → validate the voucher; valid →
          ``kind="voucher"``; a typed voucher error (already redeemed / expired /
          wrong business / …) is **caught** and returned as ``kind="invalid"``
          with its ``reason_code`` (an invalid voucher is a normal preview, not a
          request failure).
        * anything else → ``kind="invalid"`` with ``INVALID_QR_TOKEN``.

        Read-only: it neither awards a stamp nor redeems a voucher. The apply
        step (``confirm_visit_unified`` / ``redeem_reward_voucher``) is a separate
        staff confirm.
        """
        now = now or timezone.now()
        ensure_business_active(staff.business)
        qr_token = resolve_qr_token(raw_token, request, action="staff_scan_resolve")

        if qr_token.type == QRCodeToken.Type.CUSTOMER_PROFILE and qr_token.customer:
            customer_result = StaffScannerService.scan_customer_qr(
                staff, raw_token, request=request, now=now
            )
            return ScanDispatch(kind="customer", customer_result=customer_result)

        if qr_token.type == QRCodeToken.Type.CAMPAIGN_REWARD:
            try:
                voucher = CampaignRewardService.validate_reward_voucher(
                    staff, token=raw_token, request=request
                )
            except JaqynAPIException as exc:
                return ScanDispatch(kind="invalid", reason_code=exc.code)
            return ScanDispatch(kind="voucher", voucher=voucher)

        return ScanDispatch(kind="invalid", reason_code="INVALID_QR_TOKEN")
```

Note: `scan_customer_qr` calls `resolve_qr_token` again (a second audit row for the customer path). That is acceptable — the resolve row records the dispatch, the scan-customer row records the eligibility read, matching the existing audit granularity. Do not try to thread the resolved token through; keep the methods independently callable.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && pytest apps/campaigns/tests/test_scanner.py -k resolve_scan -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/campaigns/services/scanner.py backend/apps/campaigns/tests/test_scanner.py
git commit -m "feat: add read-only resolve_scan dispatch to staff scanner"
```

---

## Task 4: Serializers — dispatch + reshaped unified result

**Files:**
- Modify: `backend/apps/campaigns/serializers.py:665-700` (`UnifiedScanResultSerializer`), add `ScanDispatchSerializer`

- [ ] **Step 1: Update `UnifiedScanResultSerializer` to the list shape**

Replace the `campaign` / `campaign_skipped` fields in `UnifiedScanResultSerializer` (lines 678-679 and their methods 694-700) so it emits `campaigns` (many) and `skipped_campaigns`. The full replacement of the class body's field declarations and methods:

```python
    customer = serializers.SerializerMethodField()
    loyalty = serializers.SerializerMethodField()
    loyalty_skipped = serializers.SerializerMethodField()
    campaigns = serializers.SerializerMethodField()
    skipped_campaigns = serializers.SerializerMethodField()

    def get_customer(self, obj) -> dict:
        return {
            "name": getattr(obj.customer, "name", None),
            "phone": _mask_phone(getattr(obj.customer, "phone", None)),
        }

    def get_loyalty(self, obj) -> dict | None:
        # The staff_collect dict is passed through verbatim (already a plain dict).
        return obj.loyalty

    def get_loyalty_skipped(self, obj) -> str | None:
        return obj.loyalty_skipped_reason

    def get_campaigns(self, obj) -> list:
        return ProgressResultSerializer(
            obj.campaigns, many=True, context=self.context
        ).data

    def get_skipped_campaigns(self, obj) -> list:
        return [
            {"campaign_id": sc.campaign_id, "name": sc.name, "reason_code": sc.reason_code}
            for sc in obj.skipped_campaigns
        ]
```

Also update the class docstring to describe `campaigns`/`skipped_campaigns` instead of the single `campaign`.

- [ ] **Step 2: Add `ScanDispatchSerializer`**

After `UnifiedScanResultSerializer` (line 701), add:

```python
class ScanDispatchSerializer(serializers.Serializer):
    """Shape of a :class:`StaffScannerService.ScanDispatch` (unified resolve).

    Emits the routing ``kind`` plus exactly the payload for that kind: the
    customer scan result for ``"customer"``, the voucher for ``"voucher"``, or a
    ``reason`` code for ``"invalid"``. The other fields are ``null``.
    """

    kind = serializers.CharField()
    customer = serializers.SerializerMethodField()
    voucher = serializers.SerializerMethodField()
    reason = serializers.SerializerMethodField()

    def get_customer(self, obj) -> dict | None:
        if obj.customer_result is None:
            return None
        return CustomerScanResultSerializer(obj.customer_result).data

    def get_voucher(self, obj) -> dict | None:
        if obj.voucher is None:
            return None
        return CampaignRewardVoucherSerializer(obj.voucher, context=self.context).data

    def get_reason(self, obj) -> str | None:
        return obj.reason_code
```

- [ ] **Step 3: Verify imports compile**

Run: `cd backend && python -c "import apps.campaigns.serializers"`
Expected: no output, exit 0 (`ProgressResultSerializer`, `CustomerScanResultSerializer`, `CampaignRewardVoucherSerializer` already defined above in the same module).

- [ ] **Step 4: Commit**

```bash
git add backend/apps/campaigns/serializers.py
git commit -m "feat: serializers for scan dispatch + reshaped unified result"
```

---

## Task 5: View + URL for the resolve endpoint

**Files:**
- Modify: `backend/apps/campaigns/views/staff_views.py`, `backend/apps/campaigns/staff_urls.py`
- Test: `backend/apps/campaigns/tests/test_api.py`

- [ ] **Step 1: Write the failing endpoint tests**

Append to `backend/apps/campaigns/tests/test_api.py` (it already imports the helpers and `get_or_create_customer_profile_token`):

```python
def test_scan_dispatch_requires_auth():
    response = APIClient().post("/api/staff/campaigns/scan/", {"token": "x"}, format="json")
    assert response.status_code == 401


def test_scan_dispatch_rejects_customer():
    customer = make_customer()
    response = customer_client(customer).post(
        "/api/staff/campaigns/scan/", {"token": "x"}, format="json"
    )
    assert response.status_code == 403


def test_scan_dispatch_customer_token_happy_path():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    make_campaign(business, required_count=3)
    token = get_or_create_customer_profile_token(customer)

    response = staff_client(staff).post(
        "/api/staff/campaigns/scan/", {"token": token.token}, format="json"
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["kind"] == "customer"
    assert data["customer"]["customer"]["id"] == str(customer.id)
    assert data["voucher"] is None


def test_scan_dispatch_voucher_token_happy_path():
    business = make_business()
    customer = make_customer()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    voucher = CampaignProgressService.record_campaign_action(
        campaign=campaign, customer=customer, staff=staff
    ).voucher

    response = staff_client(staff).post(
        "/api/staff/campaigns/scan/", {"token": voucher.qr_token.token}, format="json"
    )

    assert response.status_code == 200
    data = response.data["data"]
    assert data["kind"] == "voucher"
    assert data["voucher"]["id"] == str(voucher.id)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest apps/campaigns/tests/test_api.py -k scan_dispatch -q`
Expected: FAIL — 404 (route not registered).

- [ ] **Step 3: Add the view**

In `backend/apps/campaigns/views/staff_views.py`, add `ScanDispatchSerializer` to the serializer import block (lines 15-25), then add the view (after `ScanCustomerView`, before `UnifiedConfirmVisitView`):

```python
class ScanDispatchView(_StaffScanView):
    """Resolve a scanned token to a routing tag without writing (unified scan).

    Parses the token, calls ``StaffScannerService.resolve_scan``, and shapes the
    tagged dispatch so the frontend opens the right preview (collect vs redeem vs
    invalid). Read-only — the award/redeem step is a separate staff confirm.
    """

    serializer_class = ScanCustomerSerializer

    def post(self, request):
        serializer = ScanCustomerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        dispatch = StaffScannerService.resolve_scan(
            staff, serializer.validated_data["token"], request=request
        )
        return success_response(
            ScanDispatchSerializer(dispatch, context={"request": request}).data
        )
```

- [ ] **Step 4: Register the URL**

In `backend/apps/campaigns/staff_urls.py`, import `ScanDispatchView` and add (keep it first, before `scan-customer`):

```python
    path("scan/", ScanDispatchView.as_view(), name="staff-campaign-scan"),
```

- [ ] **Step 5: Run the endpoint tests**

Run: `cd backend && pytest apps/campaigns/tests/test_api.py -k scan_dispatch -q`
Expected: PASS.

- [ ] **Step 6: Run the whole campaigns suite + schema check**

Run: `cd backend && pytest apps/campaigns -q && python manage.py spectacular --file /tmp/schema.yml`
Expected: all tests PASS; schema generates without error. If the repo commits a schema artifact, regenerate it to its tracked path and stage it.

- [ ] **Step 7: Commit**

```bash
git add backend/apps/campaigns/views/staff_views.py backend/apps/campaigns/staff_urls.py backend/apps/campaigns/tests/test_api.py
git commit -m "feat: add POST /api/staff/campaigns/scan/ resolve endpoint"
```

---

## Task 6: Frontend types — reshaped unified result + dispatch union

**Files:**
- Modify: `frontend/packages/api/src/staff/types.ts:141-154`

- [ ] **Step 1: Reshape `UnifiedScanResult` and add the dispatch + skipped types**

Replace the `UnifiedScanResult` type (lines 141-154) with:

```typescript
// One advanced-campaign leg (same shape as a confirm-visit outcome).
export type UnifiedCampaignLeg = ConfirmVisitResult;

// A campaign that was a candidate this scan but was blocked (min-gap, etc).
export type SkippedCampaign = {
  campaign_id: string;
  name: string;
  reason_code: string;
};

// Unified scan: one staff confirm advances the loyalty card + the campaign set
// (all stacking campaigns + one prioritized default). The backend returns 200
// even when a leg is empty; loyalty_skipped / skipped_campaigns carry reasons.
export type UnifiedScanResult = {
  customer: { name: string; phone: string };
  // The regular loyalty-card leg — mirrors /api/staff/collect/. null when no
  // stamp was added; loyalty_skipped explains why.
  loyalty: StaffCollectResult | null;
  loyalty_skipped: string | null;
  // Every campaign that advanced this scan (may be empty).
  campaigns: UnifiedCampaignLeg[];
  // Candidate campaigns that did not advance, with a reason each.
  skipped_campaigns: SkippedCampaign[];
};

// Read-only resolve of a scanned token → which preview the screen should open.
export type ScanDispatchResult =
  | { kind: "customer"; customer: ScanCustomerResult; voucher: null; reason: null }
  | { kind: "voucher"; customer: null; voucher: CampaignVoucherScanResult; reason: null }
  | { kind: "invalid"; customer: null; voucher: null; reason: string | null };
```

- [ ] **Step 2: Typecheck the package**

Run: `cd frontend && pnpm --filter @jaqyn/api typecheck`
Expected: FAIL — `adapters.ts` still builds the old `campaign`/`campaign_skipped` shape. (Fixed in Task 7.)

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/api/src/staff/types.ts
git commit -m "feat: reshape UnifiedScanResult + add ScanDispatchResult type"
```

---

## Task 7: Frontend adapters — unified result + dispatch

**Files:**
- Modify: `frontend/packages/api/src/staff/adapters.ts:117-128` (`adaptUnifiedScan`), add `adaptScanDispatch`

- [ ] **Step 1: Reshape `adaptUnifiedScan`**

Replace `adaptUnifiedScan` (lines 112-128) with:

```typescript
// Unified visit endpoint → UnifiedScanResult. The loyalty leg is the staff
// collect result verbatim; each campaign leg reuses adaptConfirmVisitResult.
// campaigns may be empty; skipped_campaigns carries blocked candidates.
export function adaptUnifiedScan(raw: Raw): UnifiedScanResult {
  const campaigns: Raw[] = Array.isArray(raw.campaigns) ? raw.campaigns : [];
  const skipped: Raw[] = Array.isArray(raw.skipped_campaigns) ? raw.skipped_campaigns : [];
  return {
    customer: {
      name: raw.customer?.name ?? "",
      phone: raw.customer?.phone ?? "",
    },
    loyalty: raw.loyalty ? (raw.loyalty as StaffCollectResult) : null,
    loyalty_skipped: raw.loyalty_skipped ?? null,
    campaigns: campaigns.map(adaptConfirmVisitResult),
    skipped_campaigns: skipped.map((s) => ({
      campaign_id: s.campaign_id ?? "",
      name: s.name ?? "",
      reason_code: s.reason_code ?? "",
    })),
  };
}
```

- [ ] **Step 2: Add `adaptScanDispatch`**

Append to `adapters.ts` (and add `ScanDispatchResult` to the type import block at the top):

```typescript
// Scan dispatch endpoint → ScanDispatchResult. Reuses the customer-scan and
// voucher-scan adapters per kind so the screen branches on a single tag.
export function adaptScanDispatch(raw: Raw): ScanDispatchResult {
  if (raw.kind === "customer") {
    return {
      kind: "customer",
      customer: adaptScanCustomerResult(raw.customer ?? {}),
      voucher: null,
      reason: null,
    };
  }
  if (raw.kind === "voucher") {
    return {
      kind: "voucher",
      customer: null,
      voucher: adaptVoucherScanResult(raw.voucher ?? {}),
      reason: null,
    };
  }
  return { kind: "invalid", customer: null, voucher: null, reason: raw.reason ?? null };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && pnpm --filter @jaqyn/api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/packages/api/src/staff/adapters.ts
git commit -m "feat: adapt unified scan list shape + scan dispatch"
```

---

## Task 8: Frontend API + hook for resolve

**Files:**
- Modify: `frontend/packages/api/src/staff/api.ts`, `frontend/packages/api/src/staff/hooks.ts`, `frontend/packages/api/src/staff/index.ts` (barrel, if it re-exports types — verify)

- [ ] **Step 1: Add `resolveScan` to the api object**

In `api.ts`, import `adaptScanDispatch` (add to the adapters import block) and `ScanDispatchResult` (types import block), then add to `staffApi` (after `scanCustomerForCampaigns`):

```typescript
  // Read-only resolve of a scanned token → which preview to open. One round-trip
  // replaces the old visit/redeem mode toggle; no writes happen here.
  resolveScan: (token: string): Promise<ScanDispatchResult> =>
    api.post<any>("/api/staff/campaigns/scan/", { token }).then(adaptScanDispatch),
```

- [ ] **Step 2: Add the hook**

In `hooks.ts`, add (after `useScanCustomerForCampaigns`):

```typescript
export const useResolveScan = () =>
  useMutation({ mutationFn: (token: string) => staffApi.resolveScan(token) });
```

- [ ] **Step 3: Verify the barrel re-exports the new type**

Confirm `ScanDispatchResult`, `UnifiedCampaignLeg`, and `SkippedCampaign` are exported from the package entry (the staff `types.ts` is re-exported via `export * from "./staff/types"` or similar). If the index uses an explicit list, add them.

Run: `cd frontend && pnpm --filter @jaqyn/api typecheck && pnpm --filter @jaqyn/api build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/packages/api/src/staff/api.ts frontend/packages/api/src/staff/hooks.ts frontend/packages/api/src/staff/index.ts
git commit -m "feat: resolveScan api method + useResolveScan hook"
```

---

## Task 9: Scan screen — single resolve-then-branch flow (remove mode toggle)

**Files:**
- Modify: `frontend/apps/web/app/staff/scan/page.tsx`

- [ ] **Step 1: Remove the mode machinery**

Delete the `ScanMode` type (line 32) and the `ModeToggle` component (lines 667-693). Remove the `useState<ScanMode>` (line 709), the `<ModeToggle .../>` render (line 898), and the `mode`-based `scanHint` (line 862) — replace the hint with the unified prompt:

```typescript
  const scanHint = t("staff.campaign.pointUnified");
```

Update imports: add `useResolveScan` to the `@jaqyn/api` hook import; add `ScanDispatchResult` to the type import.

- [ ] **Step 2: Replace `handleScan` with a resolve-then-branch**

Replace the whole `handleScan` (lines 765-801) with:

```typescript
  const resolveScan = useResolveScan();

  const handleScan = (token: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    scannedTokenRef.current = token;

    resolveScan.mutate(token, {
      onSuccess(dispatch: ScanDispatchResult) {
        if (dispatch.kind === "customer") {
          setOverlay({ kind: "visit_eligibility", result: dispatch.customer });
          return;
        }
        if (dispatch.kind === "voucher") {
          const v = dispatch.voucher;
          if (v.state === "valid") {
            setOverlay({ kind: "reward_valid", result: v });
            return;
          }
          setOverlay({
            kind: "invalid",
            title: t(`staff.campaign.invalid.${v.state}`),
            reason: v.reason ?? t("staff.campaign.invalid.generic"),
          });
          return;
        }
        // kind === "invalid"
        setOverlay({
          kind: "invalid",
          title: t("staff.campaign.invalid.not_found"),
          reason: dispatch.reason ?? t("staff.campaign.invalid.generic"),
        });
      },
      onError(error) { showError(error); },
    });
  };
```

Move the `const resolveScan = useResolveScan();` declaration up with the other hook calls (near line 702) rather than inside the handler region; the inline placement above is illustrative. Add `resolveScan.reset();` to the `dismiss` callback's reset list (line 741-746). Remove the now-unused `useScanCampaignVoucher` import + `scanVoucher` instance if no longer referenced (it is replaced by resolve; `useRedeemCampaignVoucher` is still used by `handleRedeem`).

- [ ] **Step 2b: Make the collect preview read-only (no per-campaign tapping)**

The decision is one confirm that advances the whole set — not a picker. Today `VisitEligibilitySheet` lets staff tap to select a single campaign, and `handleConfirmVisit` forwards that as `campaignId`, which the backend treats as the single-target override. Decouple them:

- In `VisitEligibilitySheet` (lines 110-229), drop the `selectedId`/`onSelect`/`isPending`-driven selection: render each eligible campaign row as a static summary (remove the `<button>` wrapper, `aria-pressed`, `onSelect`, and the selected/✓ styling — keep the name, sub-line, and `current→next/goal` progress). The single "Confirm visit" button stays.
- Remove the `selectedCampaignId` state (line 715), its setter usage, and the `onSelect` prop threading at the render site (lines 928-936).
- In `handleConfirmVisit` (lines 803-816), call `confirmVisit.mutate({ token: scannedTokenRef.current })` with **no** `campaignId` so the backend advances the full set (loyalty + all stacking + one default).

This keeps `VisitEligibilitySheet` as the preview of *what will advance*, with one confirm.

- [ ] **Step 3: Render the multi-campaign result**

Replace `VisitUnifiedSheet`'s single-campaign body (lines 249-338) so it maps `result.campaigns` and lists `result.skipped_campaigns`. Replace the destructure and the campaign-leg JSX:

```typescript
  const { loyalty, campaigns, skipped_campaigns } = result;
  const completed = campaigns.find((c) => c.state === "completed");
  const campaignComplete = !!completed;
  const rewardReady = loyalty?.state === "reward_ready";
```

Then, in the campaign region (replacing the single `campaign` block at lines 300-337), render each advanced campaign with the existing `VisitLegRow`, give a completed one the celebratory treatment, and append a muted line per skipped campaign:

```tsx
          {campaigns.length === 0 && skipped_campaigns.length === 0 && (
            <VisitLegRow
              icon="🎯"
              title={t("cmp.staff.campaignTitle")}
              heading=""
              value={null}
              muted={t("cmp.staff.noCampaign")}
            />
          )}
          {campaigns.map((c) =>
            c.state === "completed" ? (
              <div key={c.campaign_name} style={{ background: "#FBEFD9", borderRadius: 14, padding: "14px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 30, animation: "jqPop .5s ease" }}>🎉</div>
                <div style={{ font: "800 18px 'Bricolage Grotesque',sans-serif", color: "#B07A1E", marginTop: 4 }}>{c.campaign_name}</div>
                <div style={{ display: "inline-block", background: "#fff", color: "#B07A1E", borderRadius: 11, padding: "7px 14px", marginTop: 8, font: "700 14px 'Bricolage Grotesque',sans-serif" }}>
                  🎁 {t("cmp.staff.campaignComplete").replace("{reward}", c.reward_title ?? "")}
                </div>
              </div>
            ) : (
              <VisitLegRow
                key={c.campaign_name}
                icon="🎯"
                title={t("cmp.staff.campaignTitle")}
                heading={c.campaign_name}
                value={t("cmp.staff.campaignProgress")
                  .replace("{current}", String(c.current_count))
                  .replace("{goal}", String(c.goal))}
                muted={null}
              />
            ),
          )}
          {skipped_campaigns.map((s) => (
            <VisitLegRow
              key={s.campaign_id}
              icon="🎯"
              title={t("cmp.staff.campaignTitle")}
              heading={s.name}
              value={null}
              muted={t("cmp.staff.noCampaignReason").replace("{reason}", s.reason_code)}
            />
          ))}
```

Keep the loyalty `VisitLegRow` above this unchanged. Keep `flashColor`/`duration` keyed on `campaignComplete`.

- [ ] **Step 4: Run the app, verify the flow live**

Use the preview tooling (preview_start, then drive the staff scan screen). Because the scan needs a camera, exercise it through the env-gated manual/test-upload path already in `CameraOff` (set `NEXT_PUBLIC_ENABLE_TEST_UPLOAD=true`) or the manual-code input. Confirm: scanning a customer QR opens the collect preview; confirming advances and shows the multi-campaign result; scanning a voucher opens the redeem preview. Capture a screenshot of the result card.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/staff/scan/page.tsx
git commit -m "feat: single resolve-then-branch staff scan, no mode toggle"
```

---

## Task 10: Result card above the bottom nav

**Files:**
- Modify: `frontend/apps/web/app/staff/scan/page.tsx` (`SheetBackdrop`, line 47-66)

- [ ] **Step 1: Raise the overlay above the nav and clear the safe area**

The bottom nav is `fixed bottom-0 z-50` (`StaffNav.tsx:65`); the backdrop is `z-[45]`, so the nav paints over the sheet's lower edge and its button/text are hidden. Raise the backdrop above the nav and pad the sheet content past the nav + home-indicator. Replace `SheetBackdrop` (lines 47-66) with:

```tsx
/** Full-screen dim + bottom sheet, above the fixed bottom nav (z-50) so result
 *  cards are never clipped by it. Tapping the backdrop dismisses. */
function SheetBackdrop({
  dim = "rgba(8,6,3,.55)",
  onDismiss,
  children,
}: {
  dim?: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-[60] flex flex-col justify-end"
      style={{ background: dim }}
      onClick={onDismiss}
    >
      {children}
    </div>
  );
}
```

Then add bottom padding clearing the safe-area inset to each sheet's content container by appending to `SHEET_STYLE` (line 78-83):

```typescript
const SHEET_STYLE: React.CSSProperties = {
  position: "relative",
  background: "#fff",
  borderRadius: "30px 30px 0 0",
  animation: "jqRise .32s cubic-bezier(.22,1,.36,1)",
  // Clear the home-indicator / safe area so the sheet's last line + primary
  // button are never under the device chrome (the nav itself now sits beneath
  // this z-60 overlay).
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
};
```

(The per-sheet `padding` shorthand overrides this in some sheets — for those, ensure their explicit `padding` bottom value already accounts for the inset, or switch them to longhand `paddingTop/paddingRight/paddingLeft` and keep `SHEET_STYLE`'s `paddingBottom`. Verify each sheet that spreads `...SHEET_STYLE, padding: "..."` still clears the nav; the simplest fix is to bump those bottom values by ~12px and rely on the z-60 raise as the primary fix.)

- [ ] **Step 2: Add a regression test for the z-order**

Create `frontend/apps/web/app/staff/scan/__tests__/sheet-backdrop.test.tsx` (mirror the app's existing Vitest/RTL setup; if the scan page has no test dir yet, this establishes it):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SheetBackdrop } from "../page";

// The bottom nav is fixed at z-50; the result overlay must sit above it (z-60)
// so the post-action card and its button are never hidden behind the nav.
describe("SheetBackdrop", () => {
  it("renders above the bottom nav", () => {
    render(
      <SheetBackdrop onDismiss={() => {}}>
        <div>card</div>
      </SheetBackdrop>,
    );
    const overlay = screen.getByText("card").parentElement!;
    expect(overlay.className).toContain("z-[60]");
  });
});
```

This requires exporting `SheetBackdrop` from `page.tsx` (add `export` to its declaration). If exporting from a `"use client"` page component is undesirable, extract `SheetBackdrop` + `SHEET_STYLE` into a sibling `frontend/apps/web/app/staff/scan/_components/SheetBackdrop.tsx` and import it back into `page.tsx`; test the extracted module instead. Prefer extraction — it keeps the page free of test-only exports and matches the `_components` pattern used elsewhere.

- [ ] **Step 3: Run the test**

Run: `cd frontend && pnpm --filter web test -- sheet-backdrop`
Expected: PASS.

- [ ] **Step 4: Verify live that the card clears the nav**

With the preview running, open a result sheet and screenshot. Confirm the primary button and last text line sit fully above the bottom nav. Use `preview_resize` to check a notched viewport.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/staff/scan/
git commit -m "fix: render staff scan result card above the bottom nav"
```

---

## Task 11: i18n copy for the unified flow

**Files:**
- Modify: the locale catalog(s) under `frontend/packages/i18n/` (match the existing key namespaces `staff.campaign.*` and `cmp.staff.*`)

- [ ] **Step 1: Add the new keys**

Add to every locale catalog (find them: `grep -rl "staff.campaign.pointVisit" frontend/packages/i18n/src`):

- `staff.campaign.pointUnified` — e.g. EN "Point at a customer or reward QR".

Confirm the keys referenced by the new render paths already exist (they are reused from the current screen): `cmp.staff.noCampaign`, `cmp.staff.noCampaignReason`, `cmp.staff.campaignProgress`, `cmp.staff.campaignComplete`, `cmp.staff.campaignTitle`, `staff.campaign.invalid.not_found`, `staff.campaign.invalid.generic`. Only add what `grep` shows missing.

Remove now-unused keys only if nothing else references them: `staff.campaign.modeVisit`, `staff.campaign.modeRedeem`, `staff.campaign.pointVisit`, `staff.campaign.pointVoucher` (verify with `grep -rn` across `frontend/` before deleting).

- [ ] **Step 2: Typecheck + lint**

Run: `cd frontend && pnpm --filter @jaqyn/i18n typecheck && pnpm --filter web lint`
Expected: PASS — no missing-key type errors (if the i18n package enforces a key union).

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/i18n/
git commit -m "i18n: unified scan prompt; drop mode-toggle keys"
```

---

## Task 12: Full verification sweep

- [ ] **Step 1: Backend**

Run: `cd backend && pytest apps/campaigns -q && ruff check apps/campaigns && mypy apps/campaigns`
Expected: tests PASS; ruff clean; mypy clean (the new dataclasses are fully typed).

- [ ] **Step 2: Frontend**

Run: `cd frontend && pnpm turbo typecheck lint test --filter=web --filter=@jaqyn/api --filter=@jaqyn/i18n`
Expected: all PASS.

- [ ] **Step 3: OpenAPI schema freshness**

Run: `cd backend && python manage.py spectacular --file <tracked schema path>` and stage the diff if the schema is committed.

- [ ] **Step 4: Manual end-to-end (live)**

With the local live stack (Docker backend on :8000 + Next proxy), run the staff scan against a real customer QR enrolled in one stacking + one default campaign and a loyalty program: confirm one scan + one confirm advances all three legs and the result card lists each, fully visible above the nav. Then scan an ACTIVE voucher QR: confirm the redeem preview → redeem → success card. State results plainly.

- [ ] **Step 5: Final commit / branch**

Ensure all work is on a branch off `main` (e.g. `feat/staff-scan-unified`). Open a PR referencing the spec and ADR.
