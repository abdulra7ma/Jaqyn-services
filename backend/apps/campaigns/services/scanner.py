"""Campaign-aware staff scanner (plan §1.2).

The staff scanner extends the existing staff-scan/collect seam: staff scan the
*same* customer personal QR they already scan for loyalty, and the result now
also surfaces the campaigns that customer is eligible for (plan D2/D3). It also
resolves and validates a campaign reward voucher for redemption.

Every scan is logged to ``apps.qr.ScanLog`` (the audit seam). Structured results
are returned as dataclasses — never bare dicts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from django.utils import timezone
from rest_framework import status

from apps.businesses.models import Business
from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignRewardVoucher,
)
from apps.campaigns.services.eligibility import (
    CampaignEligibilityService,
    EligibilityResult,
    IneligibilityReason,
)
from apps.campaigns.services.fraud import FraudService
from apps.campaigns.services.group import CampaignGroupService, GroupConfirmResult
from apps.campaigns.services.progress import CampaignProgressService, ProgressResult
from apps.campaigns.services.rewards import CampaignRewardService
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import resolve_qr_token
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException
from core.logging import log_scan


@dataclass(frozen=True)
class EligibleCampaignView:
    """One campaign row in a scan result (plan §1.2; multi-form-loyalty design §1).

    ``eligible`` mirrors the pipeline outcome; ``reason_code`` explains a block.
    ``progress_count``/``required_count`` let the staff UI show "2 / 3" without a
    second request.

    ``mechanic`` is ``visit`` for individual challenges and ``None`` for group or
    social campaigns; loyalty card rows are emitted by apps.loyalty instead.
    """

    campaign: Campaign
    eligible: bool
    reason_code: str | None
    progress_count: int
    required_count: int
    mechanic: str | None
    campaign_type: str
    reward_title: str | None


@dataclass(frozen=True)
class SkippedCampaign:
    """A campaign that was a candidate this scan but did not advance (§14).

    ``campaign_id`` is the raw ``Campaign`` primary key (a ``UUID``) so callers
    can match it against a campaign without coercion; the serializer renders it
    as a string at the API boundary (Task 4). ``reason_code`` is the domain error
    code from the eligibility/fraud gate (e.g. ``CAMPAIGN_MIN_GAP``) so the staff
    UI and audit log can explain the gap.
    """

    campaign_id: UUID
    name: str
    reason_code: str


@dataclass(frozen=True)
class UnifiedScanResult:
    """Result of a single staff scan that advances eligible campaigns (§14).

    Post-restructure there is no separate loyalty leg — a loyalty card is now an
    INDIVIDUAL (STAMP) campaign, so one staff scan advances campaigns only:

    * ``campaigns`` — every campaign that advanced this scan: all eligible
      campaigns with ``allow_multiple_campaign_counting`` set, plus the single
      prioritized eligible default campaign (one visit / one default stamp). Each
      element is a :class:`~apps.campaigns.services.progress.ProgressResult`.
    * ``skipped_campaigns`` — campaigns that were candidates but were blocked
      (e.g. min-gap), each carrying its reason code.

    No campaign's failure aborts another. Only an invalid / non-CUSTOMER_PROFILE
    token hard-fails (raised before this is built).
    """

    customer: object
    campaigns: list[ProgressResult]
    skipped_campaigns: list[SkippedCampaign]


@dataclass(frozen=True)
class CustomerScanResult:
    """Result of scanning a customer's personal QR for campaigns (plan §1.2).

    Carries the resolved customer and the per-campaign eligibility views at the
    scanning staff member's business.
    """

    customer: object
    business: Business
    campaigns: list[EligibleCampaignView] = field(default_factory=list)


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


def ensure_business_active(business: Business) -> None:
    """Raise ``BUSINESS_NOT_ACTIVE`` unless the business is APPROVED.

    Mirrors the loyalty guard; a non-approved business cannot run campaign scans.
    """
    if business.status != Business.Status.APPROVED:
        raise JaqynAPIException(
            "BUSINESS_NOT_ACTIVE", status_code=status.HTTP_400_BAD_REQUEST
        )


class StaffScannerService:
    """Campaign-aware staff scanning (plan §1.2).

    Resolves the customer personal QR, lists eligible campaigns, confirms a visit
    against a chosen campaign, and resolves/redeems a reward voucher. Group
    confirmation is a Phase 2 seam.
    """

    @staticmethod
    def scan_customer_qr(
        staff: StaffMember, raw_token: str, request=None, now: datetime | None = None
    ) -> CustomerScanResult:
        """Resolve a CUSTOMER_PROFILE token to that customer's eligible campaigns.

        Validates the token is a ``CUSTOMER_PROFILE`` with a customer
        (``INVALID_QR_TOKEN`` otherwise), guards the business is active, rejects a
        staff member scanning their own business owner QR (``WRONG_BUSINESS``),
        then runs the eligibility pipeline for every ACTIVE campaign at the staff
        member's business. Read-only; the underlying ``resolve_qr_token`` writes
        the scan-resolve audit row.

        Each returned row carries campaign type, reward title, and visit progress.
        """
        now = now or timezone.now()
        qr_token = resolve_qr_token(raw_token, request, action="campaign_scan_customer")
        if (
            qr_token.type != QRCodeToken.Type.CUSTOMER_PROFILE
            or qr_token.customer is None
        ):
            raise JaqynAPIException(
                "INVALID_QR_TOKEN", status_code=status.HTTP_400_BAD_REQUEST
            )

        customer = qr_token.customer
        business = staff.business
        ensure_business_active(business)
        if customer.id == business.owner_id:
            raise JaqynAPIException(
                "WRONG_BUSINESS",
                "Cannot scan your own business QR",
                status.HTTP_403_FORBIDDEN,
            )

        results = CampaignEligibilityService.eligible_campaigns_for_customer(
            business, customer.id, now
        )
        # One query for the customer's participant rows across all listed campaigns;
        # carries progress_count so each row is rendered without an N+1 per-campaign
        # lookup. The campaign's rule (which
        # holds the mechanic + points/spend rates) is already select_related on each
        # result by ``eligible_campaigns_for_customer``.
        participant_by_campaign = {
            p.campaign_id: p
            for p in CampaignParticipant.objects.filter(
                campaign__in=[r.campaign for r in results], customer=customer
            )
        }
        views = [_to_view(result, participant_by_campaign) for result in results]
        return CustomerScanResult(customer=customer, business=business, campaigns=views)

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

        Redemption and cancellation deactivate the voucher's QR token
        (``is_active=False``), so ``resolve_qr_token`` rejects it up front with
        ``INVALID_QR_TOKEN`` — it never reaches the type switch. To still give the
        staff a meaningful preview ("already redeemed"), that rejection is caught
        and the raw token is matched directly against a campaign reward voucher
        (FK lookup, tolerant of an inactive token). A match re-runs the read-only
        voucher validation to surface the real reason (e.g.
        ``VOUCHER_ALREADY_REDEEMED``); no match falls through to
        ``INVALID_QR_TOKEN``.

        Read-only: it neither awards a stamp nor redeems a voucher. The apply
        step (``confirm_visit_unified`` / ``redeem_reward_voucher``) is a separate
        staff confirm.
        """
        now = now or timezone.now()
        ensure_business_active(staff.business)
        try:
            qr_token = resolve_qr_token(raw_token, request, action="staff_scan_resolve")
        except JaqynAPIException:
            # A redeemed/cancelled voucher has a deactivated QR token, which
            # resolve_qr_token rejects as INVALID_QR_TOKEN. Fall back to a direct
            # voucher lookup so the staff still sees a typed preview reason
            # instead of a bare "invalid token". Anything that isn't a known
            # voucher stays INVALID_QR_TOKEN.
            return StaffScannerService._dispatch_inactive_voucher(staff, raw_token)

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

    @staticmethod
    def _dispatch_inactive_voucher(staff: StaffMember, raw_token: str) -> ScanDispatch:
        """Resolve a deactivated-token voucher to a typed invalid dispatch.

        A redeemed or cancelled voucher's QR token is ``is_active=False``, so the
        normal ``resolve_qr_token`` path rejects it before the type switch. This
        matches the raw token directly against a ``CAMPAIGN_REWARD`` voucher (FK
        lookup, which ignores ``is_active``); if found, it re-runs the read-only
        voucher validation by voucher code to surface the real reason code (e.g.
        ``VOUCHER_ALREADY_REDEEMED``). When the token belongs to no voucher it is
        a genuine ``INVALID_QR_TOKEN``. Read-only — no writes.
        """
        voucher = (
            CampaignRewardVoucher.objects.select_related("business")
            .filter(qr_token__token=raw_token)
            .first()
        )
        if voucher is None:
            return ScanDispatch(kind="invalid", reason_code="INVALID_QR_TOKEN")
        try:
            valid = CampaignRewardService.validate_reward_voucher(
                staff, code=voucher.voucher_code
            )
        except JaqynAPIException as exc:
            return ScanDispatch(kind="invalid", reason_code=exc.code)
        return ScanDispatch(kind="voucher", voucher=valid)

    @staticmethod
    def confirm_visit(
        staff: StaffMember,
        campaign_id: UUID,
        customer,
        request=None,
        now: datetime | None = None,
    ) -> ProgressResult:
        """Count a visit toward a specific campaign at the staff member's business.

        Loads the campaign (``CAMPAIGN_NOT_FOUND``) and verifies it belongs to the
        staff member's business (``WRONG_BUSINESS``). Runs the duplicate-visit
        fraud check; if it fires, the activity is flagged (audit + business alert)
        and the visit is rejected with ``CAMPAIGN_MIN_GAP`` rather than counted.
        Otherwise delegates to ``CampaignProgressService.record_campaign_action``
        (which locks, re-checks eligibility, increments, and completes if due) and
        logs the scan outcome.

        """
        now = now or timezone.now()
        campaign = _load_campaign_for_staff(campaign_id, staff)

        duplicate = FraudService.detect_duplicate_visit(campaign, customer.id, now)
        if duplicate is not None:
            FraudService.flag_suspicious_activity(duplicate, staff.business)
            log_scan(
                staff=staff,
                business=staff.business,
                customer=customer,
                action="campaign_confirm_visit",
                status=ScanLog.Status.BLOCKED,
                failure_reason="CAMPAIGN_MIN_GAP",
            )
            raise JaqynAPIException(
                "CAMPAIGN_MIN_GAP", status_code=status.HTTP_409_CONFLICT
            )

        try:
            result = CampaignProgressService.record_campaign_action(
                campaign=campaign,
                customer=customer,
                staff=staff,
                now=now,
            )
        except JaqynAPIException as exc:
            log_scan(
                staff=staff,
                business=staff.business,
                customer=customer,
                action="campaign_confirm_visit",
                status=ScanLog.Status.BLOCKED,
                failure_reason=exc.code,
            )
            raise

        log_scan(
            staff=staff,
            business=staff.business,
            customer=customer,
            action="campaign_confirm_visit",
            status=ScanLog.Status.SUCCESS,
            metadata={
                "campaign_id": str(campaign.id),
                "completed": result.completed,
            },
        )
        return result

    @staticmethod
    def confirm_visit_unified(
        staff: StaffMember,
        raw_token: str,
        campaign_id: UUID | None = None,
        request=None,
        now: datetime | None = None,
    ) -> "UnifiedScanResult":
        """Advance every eligible campaign for a customer in one staff scan (§14).

        Resolves the customer's ``CUSTOMER_PROFILE`` token to the customer; an
        invalid / non-CUSTOMER_PROFILE / customer-less token is the **only** hard
        failure (``INVALID_QR_TOKEN``). Guards the business is active.

        Advances every eligible campaign that opts into
        ``allow_multiple_campaign_counting`` plus the single prioritized eligible
        default campaign (§14). An explicit ``campaign_id`` overrides this and
        targets only that campaign (the redesigned staff loyalty chooser always
        takes this choose-one path). Each advance runs its own atomic/lock seam via
        :meth:`confirm_visit`; a campaign blocked by the eligibility/fraud gate is
        recorded in ``skipped_campaigns`` and never aborts the others. The advances
        are deliberately NOT wrapped in one outer transaction, so skipping one
        never rolls back another.

        """
        now = now or timezone.now()
        qr_token = resolve_qr_token(raw_token, request, action="unified_confirm_visit")
        if (
            qr_token.type != QRCodeToken.Type.CUSTOMER_PROFILE
            or qr_token.customer is None
        ):
            raise JaqynAPIException(
                "INVALID_QR_TOKEN", status_code=status.HTTP_400_BAD_REQUEST
            )
        customer = qr_token.customer
        ensure_business_active(staff.business)

        # --- CAMPAIGN advances ----------------------------------------------
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

        target_ids: list[UUID]
        if campaign_id is not None:
            # Explicit single-target contract: advance only the tapped campaign.
            target_ids = [campaign_id]
        else:
            # Stacking targets: every stacking campaign that is eligible, plus any
            # stacking campaign blocked only by the min-gap fraud gate — those are
            # genuine candidates this visit, so confirm_visit re-runs the gate and
            # records them in skipped_campaigns rather than silently dropping them.
            stacking_ids = [
                r.campaign.id
                for r in results
                if r.campaign.allow_multiple_campaign_counting
                and (r.eligible or r.reason_code == IneligibilityReason.MIN_GAP.value)
            ]
            nonstacking_results = [
                r for r in eligible if not r.campaign.allow_multiple_campaign_counting
            ]
            chosen_default = CampaignProgressService.resolve_priority_campaign(
                nonstacking_results, now=now
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
                        staff,
                        target_id,
                        customer,
                        request=request,
                        now=now,
                    )
                )
            except JaqynAPIException as exc:
                skipped.append(
                    SkippedCampaign(
                        # Raw campaign id (UUID); the serializer str-ifies at the
                        # API boundary (Task 4). Kept raw here so callers can match
                        # it against a ``Campaign.id`` without coercing.
                        campaign_id=target_id,
                        name=name_by_id.get(target_id, ""),
                        reason_code=exc.code,
                    )
                )

        return UnifiedScanResult(
            customer=customer,
            campaigns=campaigns,
            skipped_campaigns=skipped,
        )

    @staticmethod
    def scan_reward_qr(
        staff: StaffMember,
        token: str | None = None,
        code: str | None = None,
        request=None,
    ) -> CampaignRewardVoucher:
        """Resolve and validate a campaign reward voucher without redeeming it (§19).

        Delegates to ``CampaignRewardService.validate_reward_voucher`` (existence,
        business match, ACTIVE status, not expired). Returns the voucher when
        valid; the validate path raises a typed error otherwise.
        """
        return CampaignRewardService.validate_reward_voucher(
            staff, code=code, token=token, request=request
        )

    @staticmethod
    def confirm_social(
        staff: StaffMember,
        raw_token: str,
        campaign_id: UUID,
        request=None,
        now: datetime | None = None,
    ) -> ProgressResult:
        """Confirm staff-verified social proof for a SOCIAL campaign (design §5/§7).

        Resolves the customer's ``CUSTOMER_PROFILE`` token (``INVALID_QR_TOKEN`` for
        a non-customer token), loads the campaign and asserts it belongs to the
        staff member's business (``WRONG_BUSINESS``), then delegates to
        ``CampaignProgressService.confirm_social_proof`` (which validates the
        campaign is SOCIAL, completes the participant idempotently, and mints the
        voucher). Logs the scan outcome to ``ScanLog`` either way.
        """
        now = now or timezone.now()
        qr_token = resolve_qr_token(
            raw_token, request, action="campaign_confirm_social"
        )
        if (
            qr_token.type != QRCodeToken.Type.CUSTOMER_PROFILE
            or qr_token.customer is None
        ):
            raise JaqynAPIException(
                "INVALID_QR_TOKEN", status_code=status.HTTP_400_BAD_REQUEST
            )
        customer = qr_token.customer
        campaign = _load_campaign_for_staff(campaign_id, staff)
        try:
            result = CampaignProgressService.confirm_social_proof(
                campaign, customer, staff=staff, now=now
            )
        except JaqynAPIException as exc:
            log_scan(
                staff=staff,
                business=staff.business,
                customer=customer,
                action="campaign_confirm_social",
                status=ScanLog.Status.BLOCKED,
                failure_reason=exc.code,
            )
            raise
        log_scan(
            staff=staff,
            business=staff.business,
            customer=customer,
            action="campaign_confirm_social",
            status=ScanLog.Status.SUCCESS,
            metadata={
                "campaign_id": str(campaign.id),
                "voucher_id": str(result.voucher.id),
            },
        )
        return result

    @staticmethod
    def confirm_group_visit(
        staff: StaffMember, group_id, request=None, now: datetime | None = None
    ) -> GroupConfirmResult:
        """Confirm a coordinated group check-in and issue the leader voucher (§11/Q4).

        Group reward = leader gets one voucher (plan Q4). Delegates to
        ``CampaignGroupService.confirm_group_visit``, which locks the campaign +
        session, validates the required group size was reached within the check-in
        window, marks the session COMPLETED, and mints the single leader voucher
        under the reward-cap re-check. Logs the scan outcome to ``ScanLog`` either
        way and re-raises the typed domain error on failure.
        """
        now = now or timezone.now()
        try:
            result = CampaignGroupService.confirm_group_visit(staff, group_id, now=now)
        except JaqynAPIException as exc:
            log_scan(
                staff=staff,
                business=staff.business,
                action="campaign_confirm_group",
                status=ScanLog.Status.BLOCKED,
                failure_reason=exc.code,
            )
            raise

        log_scan(
            staff=staff,
            business=staff.business,
            customer=result.session.group_leader,
            action="campaign_confirm_group",
            status=ScanLog.Status.SUCCESS,
            metadata={
                "group_id": str(result.session.id),
                "voucher_id": str(result.voucher.id),
                "member_count": result.member_count,
            },
        )
        return result


def _to_view(
    result: EligibilityResult, participant_by_campaign: dict
) -> EligibleCampaignView:
    """Map an :class:`EligibilityResult` to an :class:`EligibleCampaignView`.

    ``participant_by_campaign`` maps campaign id → the customer's
    :class:`CampaignParticipant` (absent when they have no row yet, in which case
    progress reads as 0). The campaign's ``rule`` and ``reward``
    are read off the already-joined relations (no extra query) to expose the
    campaign mechanic and reward title used by the staff campaign section.
    """
    campaign = result.campaign
    rule = getattr(campaign, "rule", None)
    reward = getattr(campaign, "reward", None)
    required = rule.required_count if rule is not None else 1
    mechanic = rule.mechanic if rule is not None else None
    participant = participant_by_campaign.get(campaign.id)
    progress = participant.progress_count if participant is not None else 0

    return EligibleCampaignView(
        campaign=campaign,
        eligible=result.eligible,
        reason_code=result.reason_code,
        progress_count=progress,
        required_count=required,
        mechanic=mechanic,
        campaign_type=campaign.campaign_type,
        reward_title=reward.title if reward is not None else None,
    )


def _load_campaign_for_staff(campaign_id, staff: StaffMember) -> Campaign:
    """Load a campaign and assert it belongs to the staff member's business."""
    try:
        campaign = Campaign.objects.select_related("rule", "reward").get(id=campaign_id)
    except Campaign.DoesNotExist:
        raise JaqynAPIException(
            "CAMPAIGN_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
        )
    if campaign.business_id != staff.business_id:
        raise JaqynAPIException("WRONG_BUSINESS", status_code=status.HTTP_403_FORBIDDEN)
    return campaign
