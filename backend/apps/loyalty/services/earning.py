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
from .tiers import LoyaltyTierService


# Cap on stamps applied in a single award. A till order rarely exceeds a
# handful of items; the cap guards against a fat-fingered stepper or a
# malicious client inflating a card in one request.
MAX_AWARD_QUANTITY = 30


@dataclass(frozen=True)
class LoyaltyEarnResult:
    """Balances after one staff award and the vouchers it minted.

    ``vouchers`` holds every voucher earned by this award — a multi-stamp
    award can complete more than one cycle. ``voucher`` remains as the
    single-voucher view (first minted, or None) for callers that predate
    quantity awards.
    """

    membership: LoyaltyMembership
    vouchers: list[LoyaltyVoucher]
    points_awarded: int

    @property
    def voucher(self) -> LoyaltyVoucher | None:
        """First voucher minted by this award, or None."""
        return self.vouchers[0] if self.vouchers else None


@dataclass(frozen=True)
class LoyaltyAwardItem:
    """One program leg of a combined staff award (batch collect)."""

    program: LoyaltyProgram
    bill_amount: Decimal | None
    quantity: int


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
        quantity: int = 1,
    ) -> LoyaltyEarnResult:
        """Award points, a stamp, or a visit; mint completed-cycle rewards atomically.

        Points programs also count the visit itself: ``visits_count`` never
        resets for points cards, so it is the lifetime visit total that places
        the customer on the program's cashback status ladder (``LoyaltyTier``).
        On a spend-basis program with a ladder, the awarded points come from the
        customer's current rung — ``cashback_percent`` of the bill converted to
        points via ``cashback_per_point`` (the visit being awarded counts toward
        the rung, so reaching a rung applies its rate to that same bill).
        Without a ladder the flat ``points_per_som`` rate applies unchanged.

        ``quantity`` applies to STAMP programs only (items bought in one order
        = stamps earned in one scan, capped at ``MAX_AWARD_QUANTITY``); it may
        complete several cycles in one award, minting one voucher per cycle
        until ``max_banked`` is reached — leftover stamps then keep
        accumulating. Any other program type rejects a quantity above 1.
        """
        if program.business_id != staff.business_id:
            raise JaqynAPIException("WRONG_BUSINESS")
        if program.status != LoyaltyProgram.Status.ACTIVE:
            raise JaqynAPIException("VALIDATION_ERROR", "Loyalty program is not active")
        if quantity < 1 or quantity > MAX_AWARD_QUANTITY:
            raise JaqynAPIException(
                "VALIDATION_ERROR",
                f"Quantity must be between 1 and {MAX_AWARD_QUANTITY}",
            )
        if quantity > 1 and program.type != LoyaltyProgram.Type.STAMP:
            raise JaqynAPIException(
                "VALIDATION_ERROR", "Quantity applies to stamp cards only"
            )
        activity_time = now or timezone.now()
        membership, _ = LoyaltyMembership.objects.get_or_create(
            program=program, customer=customer
        )
        membership = (
            LoyaltyMembership.objects.select_for_update()
            .select_related("program__business", "customer")
            .get(pk=membership.pk)
        )
        vouchers: list[LoyaltyVoucher] = []
        points_awarded = 0
        stamps_delta = None
        tier_name = None
        if program.type == LoyaltyProgram.Type.POINTS:
            # Lifetime visit counter — never reset for points cards, so it is
            # the customer's position on the cashback status ladder.
            membership.visits_count += 1
            if program.points_basis == LoyaltyProgram.PointsBasis.SPEND:
                if bill_amount is None or bill_amount <= 0:
                    raise JaqynAPIException(
                        "BILL_REQUIRED", "A positive bill amount is required"
                    )
                standing = LoyaltyTierService.standing(program, membership.visits_count)
                if standing.current is not None:
                    tier_name = standing.current.name
                    # Rung percent of the bill, converted to points via the
                    # redemption rate so the cashback value equals pct × bill.
                    # cashback_per_point is validated positive for points
                    # programs; the fallback only guards legacy rows.
                    points_awarded = int(
                        (
                            standing.current.cashback_percent
                            / Decimal("100")
                            / (program.cashback_per_point or Decimal("1"))
                            * bill_amount
                        ).to_integral_value(rounding=ROUND_FLOOR)
                    )
                else:
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
            membership.stamps_count += quantity
            stamps_delta = quantity
            required = program.required_count or 1
            # A quantity award can cross the target more than once — mint one
            # voucher per completed cycle until the banked-voucher cap is hit,
            # then let the leftover stamps keep accumulating.
            while membership.stamps_count >= required:
                banked = active_vouchers + len(vouchers)
                if program.max_banked is not None and banked >= program.max_banked:
                    break
                membership.stamps_count -= required
                membership.cycle += 1
                vouchers.append(LoyaltyRedemptionService.mint_voucher(membership))
        else:
            membership.visits_count += 1
            if membership.visits_count >= (program.required_count or 1):
                membership.visits_count -= program.required_count or 1
                membership.cycle += 1
                vouchers.append(LoyaltyRedemptionService.mint_voucher(membership))
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
            metadata={
                # Audit trail: which status rung priced this earn (tiered
                # cashback), and the voucher(s) completed cycles minted.
                **({"tier": tier_name} if tier_name else {}),
                **(
                    {
                        "voucher_id": str(vouchers[0].id),
                        "voucher_ids": [str(v.id) for v in vouchers],
                    }
                    if vouchers
                    else {}
                ),
            },
        )
        # one_away: if target-current == 1 after this award, send a one-away notice.
        # Idempotent per completion cycle via cycle_key in CampaignNoticeService.
        # Source: spec §C "one_away ... idempotent per cycle"; backend.md on_commit rule.
        if not vouchers:  # not yet completed this cycle
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
        if vouchers:
            transaction.on_commit(
                lambda: _enqueue_patch_evaluation(
                    customer_id,
                    "card_completed",
                    {"business_id": business_id, "category": category},
                )
            )
        return LoyaltyEarnResult(
            membership=membership, vouchers=vouchers, points_awarded=points_awarded
        )

    @staticmethod
    @transaction.atomic
    def award_batch(
        customer: User,
        staff: StaffMember,
        items: list[LoyaltyAwardItem],
    ) -> list[LoyaltyEarnResult]:
        """Apply one combined till order across several programs atomically.

        One scan, one confirm: e.g. 5 coffees on the stamp card (quantity=5)
        AND the 1000-som bill on the cashback program (bill_amount) succeed or
        fail together — a failing leg rolls back every leg. Items are applied
        in the given order; each leg reuses :meth:`award`, so per-program rules
        (quantity caps, bill requirements, tier pricing) apply unchanged.
        """
        return [
            LoyaltyEarningService.award(
                item.program,
                customer,
                staff,
                item.bill_amount,
                quantity=item.quantity,
            )
            for item in items
        ]


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
