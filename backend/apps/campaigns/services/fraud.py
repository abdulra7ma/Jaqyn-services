"""Basic campaign fraud detection (plan §15).

MVP scope: three cheap signals — a duplicate visit inside the min-gap, a single
staff member confirming an abnormal number of visits in a window, and an unusual
redemption pattern. A detected signal is *flagged* (an ``AdminAuditLog`` row plus
a business notification), not hard-blocked — the min-gap itself is enforced
upstream by the eligibility pipeline; this service is the review/alerting seam.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.utils import timezone

from apps.campaigns.constants import (
    DEFAULT_MIN_MINUTES_BETWEEN_ACTIONS,
    STAFF_ABUSE_MAX_CONFIRMS,
    STAFF_ABUSE_WINDOW_MINUTES,
)
from apps.campaigns.models import CampaignAction, CampaignRewardVoucher
from apps.reporting.models import AdminAuditLog
from apps.staff.models import StaffMember
from core.logging import emit_event


@dataclass(frozen=True)
class FraudSignal:
    """A single detected fraud signal (plan §15).

    ``kind`` is a stable machine string (e.g. ``"staff_abuse"``); ``detail``
    carries the human-readable explanation; ``subject_type``/``subject_id`` name
    the flagged entity so the audit row is queryable.
    """

    kind: str
    detail: str
    subject_type: str
    subject_id: str


class FraudService:
    """Detect and flag suspicious campaign activity (plan §15, MVP basic).

    Detection methods are pure predicates returning an optional
    :class:`FraudSignal`; :meth:`flag_suspicious_activity` is the only method
    that writes (an audit row + a business alert). The min-gap guard is also used
    by the eligibility pipeline, so a duplicate within the gap is normally blocked
    before it ever counts.
    """

    @staticmethod
    def detect_duplicate_visit(
        campaign, customer_id, now: datetime | None = None
    ) -> FraudSignal | None:
        """Flag a second visit attempt inside the campaign's min-gap (plan §15).

        Returns a signal when the customer already has a COUNTED action for this
        campaign within the configured ``minimum_time_between_actions`` (or the
        ``DEFAULT_MIN_MINUTES_BETWEEN_ACTIONS`` fallback). Read-only.
        """
        now = now or timezone.now()
        rule = getattr(campaign, "rule", None)
        if rule is not None and rule.minimum_time_between_actions is not None:
            min_gap = rule.minimum_time_between_actions
        else:
            min_gap = timedelta(minutes=DEFAULT_MIN_MINUTES_BETWEEN_ACTIONS)
        recent = CampaignAction.objects.filter(
            campaign=campaign,
            customer_id=customer_id,
            status=CampaignAction.Status.COUNTED,
            action_time__gt=now - min_gap,
        ).exists()
        if recent:
            return FraudSignal(
                kind="duplicate_visit",
                detail="Visit within the minimum gap for the campaign",
                subject_type="accounts.User",
                subject_id=str(customer_id),
            )
        return None

    @staticmethod
    def detect_staff_abuse(
        staff: StaffMember, now: datetime | None = None
    ) -> FraudSignal | None:
        """Flag a staff member confirming too many visits in a window (plan §15).

        Returns a signal when the staff member has verified at least
        ``STAFF_ABUSE_MAX_CONFIRMS`` COUNTED actions in the last
        ``STAFF_ABUSE_WINDOW_MINUTES`` minutes — the rapid self-confirm pattern.
        Read-only.
        """
        now = now or timezone.now()
        window_start = now - timedelta(minutes=STAFF_ABUSE_WINDOW_MINUTES)
        confirms = CampaignAction.objects.filter(
            verified_by_staff=staff,
            status=CampaignAction.Status.COUNTED,
            action_time__gte=window_start,
        ).count()
        if confirms >= STAFF_ABUSE_MAX_CONFIRMS:
            return FraudSignal(
                kind="staff_abuse",
                detail=(
                    f"{confirms} visit confirmations in "
                    f"{STAFF_ABUSE_WINDOW_MINUTES} minutes"
                ),
                subject_type="staff.StaffMember",
                subject_id=str(staff.id),
            )
        return None

    @staticmethod
    def detect_unusual_redemption(
        campaign, customer_id, now: datetime | None = None
    ) -> FraudSignal | None:
        """Flag an unusual redemption pattern for a customer (plan §15).

        MVP heuristic: more than one voucher for the same campaign reaching a
        terminal redeemed/expired state on the same UTC day for one customer.
        Read-only.
        """
        now = now or timezone.now()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        redeemed_today = CampaignRewardVoucher.objects.filter(
            campaign=campaign,
            customer_id=customer_id,
            status=CampaignRewardVoucher.Status.REDEEMED,
            redeemed_at__gte=day_start,
        ).count()
        if redeemed_today > 1:
            return FraudSignal(
                kind="unusual_redemption",
                detail=f"{redeemed_today} redemptions for one campaign in a day",
                subject_type="accounts.User",
                subject_id=str(customer_id),
            )
        return None

    @staticmethod
    def flag_suspicious_activity(signal: FraudSignal, business) -> AdminAuditLog:
        """Record a fraud signal and alert the business owner (plan §15).

        Writes an ``AdminAuditLog`` row (``action="campaign_fraud_flagged"``) with
        the signal kind/detail in metadata, then sends a business notification.
        This is the only fraud method that writes. Returns the audit row.
        """
        from apps.notifications.services import notifier

        audit = AdminAuditLog.objects.create(
            admin=None,
            action="campaign_fraud_flagged",
            target_type=signal.subject_type,
            target_id=signal.subject_id,
            reason=signal.detail,
            metadata={"kind": signal.kind, "business_id": str(business.id)},
        )
        owner = getattr(business, "owner", None)
        if owner is not None:
            notifier.send(
                owner,
                "email",
                "campaign_fraud_flagged",
                {"kind": signal.kind, "detail": signal.detail},
            )
        emit_event(
            "campaign_fraud_flagged",
            business_id=str(business.id),
            kind=signal.kind,
            subject_id=signal.subject_id,
        )
        return audit

    @classmethod
    def sweep(cls, now: datetime | None = None) -> int:
        """Periodic sweep over recent staff activity (plan §1.4 / §15).

        Idempotent batch used by the ``sweep_campaign_fraud`` task. Currently
        scans for staff-abuse across staff who confirmed any action in the window
        and flags each match once. Returns the number of staff members flagged.
        Duplicate-visit and unusual-redemption are evaluated inline on the write
        path, so the sweep focuses on the cross-request staff pattern.
        """
        now = now or timezone.now()
        window_start = now - timedelta(minutes=STAFF_ABUSE_WINDOW_MINUTES)
        staff_ids = (
            CampaignAction.objects.filter(
                status=CampaignAction.Status.COUNTED,
                action_time__gte=window_start,
                verified_by_staff__isnull=False,
            )
            .values_list("verified_by_staff_id", flat=True)
            .distinct()
        )
        flagged = 0
        for staff in StaffMember.objects.filter(id__in=list(staff_ids)).select_related(
            "business", "business__owner"
        ):
            signal = cls.detect_staff_abuse(staff, now)
            if signal is not None:
                cls.flag_suspicious_activity(signal, staff.business)
                flagged += 1
        return flagged
