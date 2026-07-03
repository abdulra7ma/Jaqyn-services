from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_FLOOR

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.loyalty.models import (
    LoyaltyMembership,
    LoyaltyProgram,
    LoyaltyTransaction,
    LoyaltyVoucher,
)
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException

from .redemption import LoyaltyRedemptionService


@dataclass(frozen=True)
class LoyaltyEarnResult:
    """Balances after one staff award and the optional newly earned voucher."""

    membership: LoyaltyMembership
    voucher: LoyaltyVoucher | None
    points_awarded: int


class LoyaltyEarningService:
    """Award exactly one program under a membership row lock and append its ledger."""

    @staticmethod
    @transaction.atomic
    def award(
        program: LoyaltyProgram,
        customer: User,
        staff: StaffMember,
        bill_amount: Decimal | None = None,
        now: object | None = None,
    ) -> LoyaltyEarnResult:
        """Award points, a stamp, or a visit; mint completed-cycle rewards atomically."""
        if program.business_id != staff.business_id:
            raise JaqynAPIException("WRONG_BUSINESS")
        if program.status != LoyaltyProgram.Status.ACTIVE:
            raise JaqynAPIException("VALIDATION_ERROR", "Loyalty program is not active")
        activity_time = now or timezone.now()
        membership, _ = LoyaltyMembership.objects.get_or_create(
            program=program, customer=customer
        )
        membership = (
            LoyaltyMembership.objects.select_for_update()
            .select_related("program__business", "customer")
            .get(pk=membership.pk)
        )
        voucher = None
        points_awarded = 0
        stamps_delta = None
        if program.type == LoyaltyProgram.Type.POINTS:
            if program.points_basis == LoyaltyProgram.PointsBasis.SPEND:
                if bill_amount is None or bill_amount <= 0:
                    raise JaqynAPIException(
                        "BILL_REQUIRED", "A positive bill amount is required"
                    )
                points_awarded = int(
                    (program.points_per_som * bill_amount).to_integral_value(
                        rounding=ROUND_FLOOR
                    )
                )
                membership.current_spend += bill_amount
            else:
                points_awarded = program.points_per_visit or 0
            membership.points_balance += points_awarded
        elif program.type == LoyaltyProgram.Type.STAMP:
            active_vouchers = membership.vouchers.filter(
                status=LoyaltyVoucher.Status.ACTIVE
            ).count()
            can_bank = (
                program.max_banked is None or active_vouchers < program.max_banked
            )
            membership.stamps_count += 1
            stamps_delta = 1
            if membership.stamps_count >= (program.required_count or 1) and can_bank:
                membership.stamps_count -= program.required_count or 1
                membership.cycle += 1
                voucher = LoyaltyRedemptionService.mint_voucher(membership)
        else:
            membership.visits_count += 1
            if membership.visits_count >= (program.required_count or 1):
                membership.visits_count -= program.required_count or 1
                membership.cycle += 1
                voucher = LoyaltyRedemptionService.mint_voucher(membership)
        membership.last_activity_at = activity_time
        membership.save()
        LoyaltyTransaction.objects.create(
            membership=membership,
            program=program,
            customer=customer,
            business=program.business,
            kind=LoyaltyTransaction.Kind.EARN,
            points_delta=points_awarded
            if program.type == LoyaltyProgram.Type.POINTS
            else None,
            stamps_delta=stamps_delta,
            bill_amount=bill_amount,
            staff=staff,
            metadata={"voucher_id": str(voucher.id)} if voucher else {},
        )
        # one_away: if target-current == 1 after this award, send a one-away notice.
        # Idempotent per completion cycle via cycle_key in CampaignNoticeService.
        # Source: spec §C "one_away ... idempotent per cycle"; backend.md on_commit rule.
        if voucher is None:  # not yet completed this cycle
            if program.type == LoyaltyProgram.Type.STAMP:
                remaining = (program.required_count or 1) - membership.stamps_count
            elif program.type == LoyaltyProgram.Type.VISIT:
                remaining = (program.required_count or 1) - membership.visits_count
            else:
                remaining = None  # points programs don't have a discrete target here
            if remaining == 1:
                _ck = f"loyalty:{program.id}:{membership.cycle}"
                _c = customer
                _pn = program.name

                def _do_one_away(ck: str = _ck, pn: str = _pn, c: object = _c) -> None:
                    _send_one_away(c, ck, pn)

                transaction.on_commit(_do_one_away)

        # Enqueue patch evaluation after the award commits so the Celery worker
        # never picks up an id before the outer transaction commits.
        # Source: backend.md Celery rule; spec §A "loyalty stamp/visit/points
        # recorded → events stamp_scanned / spend_recorded".
        customer_id = str(customer.id)
        business_id = str(program.business_id)
        category = program.business.category
        if stamps_delta:
            transaction.on_commit(
                lambda: _enqueue_patch_evaluation(
                    customer_id,
                    "stamp_scanned",
                    {"business_id": business_id, "category": category},
                )
            )
        if bill_amount and bill_amount > 0:
            transaction.on_commit(
                lambda: _enqueue_patch_evaluation(
                    customer_id,
                    "spend_recorded",
                    {"bill_amount": str(bill_amount), "business_id": business_id},
                )
            )
        if voucher is not None:
            transaction.on_commit(
                lambda: _enqueue_patch_evaluation(
                    customer_id,
                    "card_completed",
                    {"business_id": business_id, "category": category},
                )
            )
        return LoyaltyEarnResult(
            membership=membership, voucher=voucher, points_awarded=points_awarded
        )


def _send_one_away(customer: object, cycle_key: str, program_name: str) -> None:
    """Send a one-away notice (on_commit callback). Source: spec §C; backend.md rule."""
    from apps.notifications.services import CampaignNoticeService

    CampaignNoticeService.send_one_away(
        customer,
        target_url=f"/loyalty/programs/{cycle_key.split(':')[1]}",
        program_name=program_name,
        cycle_key=cycle_key,
    )


def _enqueue_patch_evaluation(user_id: str, event: str, meta: dict) -> None:
    """Enqueue the evaluate_patches Celery task (on_commit callback).

    Called only from transaction.on_commit so the worker cannot pick up the id
    before the outer award transaction commits. Lazy import avoids a circular
    import at module load time. Source: backend.md Celery rule; spec §A hooks.
    """
    from apps.patches.tasks import evaluate_patches

    evaluate_patches.delay(user_id, event, meta)
