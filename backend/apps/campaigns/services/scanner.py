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
    """One campaign row in a scan result (plan §1.2).

    ``eligible`` mirrors the pipeline outcome; ``reason_code`` explains a block.
    ``progress_count``/``required_count`` let the staff UI show "2 / 3" without a
    second request.
    """

    campaign: Campaign
    eligible: bool
    reason_code: str | None
    progress_count: int
    required_count: int


@dataclass(frozen=True)
class UnifiedScanResult:
    """Result of a single staff scan that advances loyalty + one campaign (§14).

    One staff action drives two independent legs:

    * ``loyalty`` — the baseline leg, always attempted. Holds the
      ``staff_collect`` result dict on success, else ``None`` with
      ``loyalty_skipped_reason`` carrying the domain error code (e.g. no active
      program, scan interval, needs-amount for SPEND).
    * ``campaign`` — the conditional leg. Holds the
      :class:`~apps.campaigns.services.progress.ProgressResult` for the single
      prioritized eligible campaign on success, else ``None`` with
      ``campaign_skipped_reason``. ``None`` for both when no eligible campaign.

    The two legs are independent: neither failure aborts the other. Only an
    invalid / non-CUSTOMER_PROFILE token hard-fails (raised before this is built).
    """

    customer: object
    loyalty: dict | None
    loyalty_skipped_reason: str | None
    campaign: "ProgressResult | None"
    campaign_skipped_reason: str | None


@dataclass(frozen=True)
class CustomerScanResult:
    """Result of scanning a customer's personal QR for campaigns (plan §1.2).

    Carries the resolved customer and the per-campaign eligibility views at the
    scanning staff member's business.
    """

    customer: object
    business: Business
    campaigns: list[EligibleCampaignView] = field(default_factory=list)


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
        progress_by_campaign = {
            p.campaign_id: p.progress_count
            for p in CampaignParticipant.objects.filter(
                campaign__in=[r.campaign for r in results], customer=customer
            )
        }
        views = [_to_view(result, progress_by_campaign) for result in results]
        return CustomerScanResult(customer=customer, business=business, campaigns=views)

    @staticmethod
    def confirm_visit(
        staff: StaffMember,
        campaign_id,
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
    def confirm_visit_for_token(
        staff: StaffMember,
        campaign_id,
        raw_token: str,
        request=None,
        now: datetime | None = None,
    ) -> ProgressResult:
        """Resolve a customer QR token then count a visit for them (plan §1.3).

        The confirm-visit endpoint receives the *campaign* the staff picked plus
        the *customer's personal QR token* (not a pre-resolved customer object).
        This resolves the ``CUSTOMER_PROFILE`` token to its customer
        (``INVALID_QR_TOKEN`` if it is the wrong type or has no customer), guards
        the business is active, then delegates to :meth:`confirm_visit` (which
        runs the fraud check, locks, re-checks eligibility, increments, and
        completes if due). Returns the resulting :class:`ProgressResult`.
        """
        now = now or timezone.now()
        qr_token = resolve_qr_token(raw_token, request, action="campaign_confirm_visit")
        if (
            qr_token.type != QRCodeToken.Type.CUSTOMER_PROFILE
            or qr_token.customer is None
        ):
            raise JaqynAPIException(
                "INVALID_QR_TOKEN", status_code=status.HTTP_400_BAD_REQUEST
            )
        ensure_business_active(staff.business)
        return StaffScannerService.confirm_visit(
            staff=staff,
            campaign_id=campaign_id,
            customer=qr_token.customer,
            request=request,
            now=now,
        )

    @staticmethod
    def confirm_visit_unified(
        staff: StaffMember,
        raw_token: str,
        campaign_id=None,
        request=None,
        now: datetime | None = None,
    ) -> "UnifiedScanResult":
        """Advance loyalty (baseline) + one prioritized campaign in one scan (§14).

        Resolves the customer's ``CUSTOMER_PROFILE`` token to the customer; an
        invalid / non-CUSTOMER_PROFILE / customer-less token is the **only** hard
        failure (``INVALID_QR_TOKEN``). Guards the business is active.

        LOYALTY leg (baseline, always attempted): delegates to
        ``apps.loyalty.services.staff_collect``. Its result dict is returned on
        success; on a ``JaqynAPIException`` the code is captured in
        ``loyalty_skipped_reason`` and the scan continues — a loyalty failure
        never aborts the campaign leg.

        CAMPAIGN leg (conditional): the target is the explicitly tapped
        ``campaign_id`` when given, else the single prioritized *eligible*
        campaign chosen by the §14 resolver over ``scan_customer_qr``'s
        eligibility rows. If a target exists it is confirmed via
        :meth:`confirm_visit`; on a ``JaqynAPIException`` the code is captured in
        ``campaign_skipped_reason`` and the scan still returns. With no eligible
        campaign both campaign fields are ``None``. A campaign failure never
        aborts the loyalty award.

        The two legs are independent — each runs its own atomic/lock seam inside
        its own service. They are deliberately NOT wrapped in one outer
        transaction, so skipping one leg never rolls back the other.
        """
        from apps.loyalty import services as loyalty_services

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

        # --- LOYALTY leg (baseline) -----------------------------------------
        loyalty: dict | None = None
        loyalty_skipped_reason: str | None = None
        try:
            loyalty = loyalty_services.staff_collect(
                staff=staff, raw_token=raw_token, program_id=None, request=request
            )
        except JaqynAPIException as exc:
            loyalty_skipped_reason = exc.code

        # --- CAMPAIGN leg (conditional) -------------------------------------
        campaign_result: ProgressResult | None = None
        campaign_skipped_reason: str | None = None
        target_id = campaign_id
        if target_id is None:
            # Resolve the single prioritized eligible campaign (§14). Reuses the
            # eligibility pipeline directly so the resolver gets the real
            # EligibilityResult rows (not the flattened scan views).
            results = CampaignEligibilityService.eligible_campaigns_for_customer(
                staff.business, customer.id, now
            )
            target = CampaignProgressService.resolve_priority_campaign(
                results, now=now
            )
            target_id = target.id if target is not None else None

        if target_id is not None:
            try:
                campaign_result = StaffScannerService.confirm_visit(
                    staff, target_id, customer, request=request, now=now
                )
            except JaqynAPIException as exc:
                campaign_skipped_reason = exc.code

        return UnifiedScanResult(
            customer=customer,
            loyalty=loyalty,
            loyalty_skipped_reason=loyalty_skipped_reason,
            campaign=campaign_result,
            campaign_skipped_reason=campaign_skipped_reason,
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
    def manual_code_lookup(
        staff: StaffMember, code: str, request=None
    ) -> CampaignRewardVoucher:
        """Look up a voucher by its typed-in code for validation (§19).

        Convenience wrapper over :meth:`scan_reward_qr` for the manual-entry path
        when the QR cannot be scanned. Returns the validated voucher.
        """
        return StaffScannerService.scan_reward_qr(staff, code=code, request=request)

    @staticmethod
    def confirm_group_visit(
        staff: StaffMember, group_session_id, request=None, now: datetime | None = None
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
            result = CampaignGroupService.confirm_group_visit(
                staff, group_session_id, now=now
            )
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
                "group_session_id": str(result.session.id),
                "voucher_id": str(result.voucher.id),
                "member_count": result.member_count,
            },
        )
        return result


def _to_view(
    result: EligibilityResult, progress_by_campaign: dict
) -> EligibleCampaignView:
    """Map an :class:`EligibilityResult` to an :class:`EligibleCampaignView`.

    ``progress_by_campaign`` maps campaign id → the customer's ``progress_count``
    (0 when they have no participant row yet).
    """
    campaign = result.campaign
    rule = getattr(campaign, "rule", None)
    required = rule.required_count if rule is not None else 1
    progress = progress_by_campaign.get(campaign.id, 0)
    return EligibleCampaignView(
        campaign=campaign,
        eligible=result.eligible,
        reason_code=result.reason_code,
        progress_count=progress,
        required_count=required,
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
        raise JaqynAPIException(
            "WRONG_BUSINESS", status_code=status.HTTP_403_FORBIDDEN
        )
    return campaign
