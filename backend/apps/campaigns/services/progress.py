"""Campaign progress and completion (plan §1.2 / §13 / §14 / §19).

Owns the write path for a counted visit: it locks the participant row, runs the
§13 eligibility pipeline, increments progress, detects completion, and on
completion mints the reward voucher *in the same atomic block*, scheduling the
notification only via ``transaction.on_commit`` (the non-negotiable
Celery-with-Postgres rule).

It also owns the §14 multiple-campaign priority resolver: when one customer visit
could count toward several active campaigns and the campaign does not opt into
``allow_multiple_campaign_counting``, exactly one campaign is chosen.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import status

from apps.campaigns.models import (
    Campaign,
    CampaignAction,
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
    CampaignRule,
)
from apps.campaigns.services.eligibility import (
    CampaignEligibilityService,
    EligibilityResult,
)
from apps.campaigns.services.rewards import CampaignRewardService
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException
from core.logging import emit_event


@dataclass(frozen=True)
class ProgressResult:
    """Outcome of recording one campaign action (plan §1.2).

    ``completed`` is ``True`` when this action finished a cycle; ``voucher`` is
    set only in that case. ``progress_count``/``required_count`` describe where
    the participant now stands so the caller can shape a progress response
    without a second query.
    """

    campaign: Campaign
    participant: CampaignParticipant
    action: CampaignAction
    completed: bool
    progress_count: int
    required_count: int
    voucher: CampaignRewardVoucher | None = None


class CampaignProgressService:
    """Join, progress, and complete campaigns (plan §1.2).

    The contention-sensitive entry point is :meth:`record_campaign_action`, which
    must be the only way a visit advances progress so the ``select_for_update``
    lock is always held across the read-modify-write.
    """

    @staticmethod
    def _lock_campaign(campaign_id) -> Campaign:
        """Re-fetch a campaign ``select_for_update`` with rule/reward joined (§1.2).

        Locks only the ``Campaign`` row (via ``of=("self",)`` where the backend
        supports it) so a concurrent completion serialises on the campaign while
        the joined ``rule``/``reward`` rows are not locked. On a backend without
        ``select_for_update`` (the SQLite test DB) the lock is a no-op and ``of``
        is ignored, but the same re-read still re-runs under the surrounding
        transaction. The relations are selected so ``getattr(campaign, "rule"/
        "reward")`` does not trigger an extra query downstream.
        """
        from django.db import connection

        queryset = Campaign.objects.select_related("rule", "reward")
        if connection.features.has_select_for_update_of:
            queryset = queryset.select_for_update(of=("self",))
        else:
            queryset = queryset.select_for_update()
        return queryset.get(id=campaign_id)

    @staticmethod
    def _required_count(campaign: Campaign) -> int:
        """Return the visit/stamp count that completes the campaign (default 1).

        Reads ``CampaignRule.required_count``; a campaign with no rule row
        completes on a single visit.
        """
        rule = getattr(campaign, "rule", None)
        return rule.required_count if rule is not None else 1

    @staticmethod
    def _mechanic(campaign: Campaign) -> str:
        """Return the INDIVIDUAL mechanic (VISIT/STAMP/SPEND), defaulting to VISIT.

        Reads ``CampaignRule.mechanic``; a campaign with no rule (or no mechanic
        set, e.g. a GROUP/SOCIAL campaign whose rule omits it) is treated as VISIT
        so the count-by-one path is the safe default.
        """
        rule = getattr(campaign, "rule", None)
        if rule is not None and rule.mechanic:
            return rule.mechanic
        return CampaignRule.Mechanic.VISIT

    @staticmethod
    def _banked_voucher_count(campaign: Campaign, customer) -> int:
        """Count a customer's unredeemed (ACTIVE) vouchers for a campaign.

        Backs the STAMP ``max_banked`` cap: a stamp completion is blocked when the
        customer already holds ``max_banked`` ACTIVE (banked, not-yet-redeemed)
        vouchers for the campaign. Source: campaigns-restructure design §3.
        """
        return CampaignRewardVoucher.objects.filter(
            campaign=campaign,
            customer=customer,
            status=CampaignRewardVoucher.Status.ACTIVE,
        ).count()

    @classmethod
    def join_campaign(cls, campaign: Campaign, customer) -> CampaignParticipant:
        """Enrol a customer in a campaign, creating their participant row (idempotent).

        Rejects a join when the campaign is not ACTIVE (``CAMPAIGN_NOT_ACTIVE``)
        or has hit ``max_participants`` (``CAMPAIGN_FULL``). Re-joining returns the
        existing row unchanged. A new row starts in JOINED with ``joined_at`` set.
        """
        if campaign.status != Campaign.Status.ACTIVE:
            raise JaqynAPIException(
                "CAMPAIGN_NOT_ACTIVE", status_code=status.HTTP_409_CONFLICT
            )
        existing = CampaignParticipant.objects.filter(
            campaign=campaign, customer=customer
        ).first()
        if existing is not None:
            return existing
        if not CampaignEligibilityService.check_participant_limit(campaign):
            raise JaqynAPIException(
                "CAMPAIGN_FULL", status_code=status.HTTP_409_CONFLICT
            )
        participant = CampaignParticipant.objects.create(
            campaign=campaign,
            customer=customer,
            status=CampaignParticipant.Status.JOINED,
            joined_at=timezone.now(),
        )
        emit_event(
            "campaign_joined",
            business_id=str(campaign.business_id),
            customer_id=str(customer.id),
            campaign_id=str(campaign.id),
        )
        return participant

    @classmethod
    def auto_join_customer(cls, campaign: Campaign, customer) -> CampaignParticipant:
        """Auto-enrol a customer on their first counted visit (plan D9).

        Only valid when ``campaign.auto_join_enabled``; otherwise raises
        ``CAMPAIGN_NOT_ELIGIBLE``. Returns the (possibly pre-existing) participant
        row. Used by the scan path so a time-window/visit campaign can count a
        visit even when the customer never tapped "join".
        """
        if not campaign.auto_join_enabled:
            raise JaqynAPIException(
                "CAMPAIGN_NOT_ELIGIBLE", status_code=status.HTTP_400_BAD_REQUEST
            )
        return cls.join_campaign(campaign, customer)

    @classmethod
    def resolve_priority_campaign(
        cls,
        results: list[EligibilityResult],
        preferred_campaign_id=None,
        now: datetime | None = None,
    ) -> Campaign | None:
        """Pick the single campaign a visit counts toward (plan §14).

        Considers only eligible results. Priority order:
        1. the customer-selected ``preferred_campaign_id`` if it is eligible;
        2. closest to completion (highest ``progress_count / required_count``);
        3. ending soonest (smallest ``end_at``; campaigns without an end sort last);
        4. newest (most recent ``created_at``) as the final tie-break.
        Returns ``None`` when no campaign is eligible.
        """
        now = now or timezone.now()
        eligible = [r for r in results if r.eligible]
        if not eligible:
            return None
        if preferred_campaign_id is not None:
            for result in eligible:
                if str(result.campaign.id) == str(preferred_campaign_id):
                    return result.campaign

        progress_by_campaign = {
            p.campaign_id: p
            for p in CampaignParticipant.objects.filter(
                campaign__in=[r.campaign for r in eligible]
            )
        }

        def sort_key(result: EligibilityResult) -> tuple[float, float, float]:
            campaign = result.campaign
            participant = progress_by_campaign.get(campaign.id)
            required = cls._required_count(campaign)
            progress = participant.progress_count if participant is not None else 0
            completion_ratio = progress / required if required else 0.0
            # Larger ratio = higher priority → negate so it sorts first.
            ends_at = campaign.end_at.timestamp() if campaign.end_at else float("inf")
            created = campaign.created_at.timestamp()
            return (-completion_ratio, ends_at, -created)

        eligible.sort(key=sort_key)
        return eligible[0].campaign

    @classmethod
    def record_campaign_action(
        cls,
        campaign: Campaign,
        customer,
        staff: StaffMember | None = None,
        verification_method: str = CampaignAction.VerificationMethod.STAFF_SCAN,
        action_type: str = CampaignAction.ActionType.VISIT,
        amount_spend: Decimal | None = None,
        now: datetime | None = None,
    ) -> ProgressResult:
        """Count one verified action toward an INDIVIDUAL campaign, completing it if due.

        Branches on the rule's mechanic (§13/§19, campaigns-restructure design §4):

        * **VISIT** / **STAMP** — each counted action increments ``progress_count``
          by one; the campaign completes when ``progress_count`` reaches the rule's
          ``required_count``. STAMP additionally honours ``max_banked``: when a
          completing stamp would push the customer over ``max_banked`` ACTIVE
          (banked, unredeemed) vouchers, the action is still counted but **no**
          voucher is minted and the result reports ``completed=False`` — the
          customer must redeem a banked voucher before earning another.
        * **SPEND** — the action carries ``amount_spend`` (rejected as
          ``VALIDATION_ERROR`` when missing/non-positive, or below the rule's
          ``min_spend``); it is accumulated onto ``current_spend`` and the campaign
          completes when ``current_spend`` reaches the rule's ``required_spend``.

        Runs inside one atomic block. Acquires two row locks in a *fixed order* —
        the ``Campaign`` row first, then the participant row — so the reward cap
        and the issued-voucher count are read-modified-written under contention
        without overshooting ``max_rewards`` and without deadlocking against any
        other path that locks the same pair (the consistent ordering is the
        anti-deadlock rule). It auto-joins first when the campaign allows and the
        customer has no row, re-runs the full §13 eligibility pipeline under the
        locks, and raises the pipeline's reason code (e.g. ``CAMPAIGN_MIN_GAP``,
        ``CAMPAIGN_DAILY_LIMIT_REACHED``) if the action is not eligible. On a
        completing action it mints exactly one voucher via
        :meth:`complete_campaign` in the *same* transaction, re-checking the reward
        cap under the campaign lock and scheduling the unlock notification via
        ``on_commit``. Because the read-modify-write is fully locked, two
        simultaneous confirms cannot double-count and two simultaneous final-slot
        completions cannot both mint a voucher over the cap.
        """
        now = now or timezone.now()
        with transaction.atomic():
            # Lock the Campaign row first (consistent order: Campaign → participant)
            # so the reward-cap re-check in complete_campaign is serialised against
            # any concurrent completion and the cap can never be overshot. ``of``
            # restricts the lock to the Campaign row itself (not the joined
            # rule/reward) on backends that support it; it is ignored where
            # ``select_for_update`` is a no-op (SQLite test DB).
            campaign = cls._lock_campaign(campaign.id)
            participant = (
                CampaignParticipant.objects.select_for_update()
                .filter(campaign=campaign, customer=customer)
                .first()
            )
            if participant is None:
                # No row yet: auto-join (raises if the campaign forbids it), then
                # re-select FOR UPDATE so the rest of the block holds the lock.
                cls.auto_join_customer(campaign, customer)
                participant = (
                    CampaignParticipant.objects.select_for_update()
                    .get(campaign=campaign, customer=customer)
                )

            result = CampaignEligibilityService.evaluate(
                campaign, customer.id, participant, now
            )
            if not result.eligible:
                raise JaqynAPIException(
                    result.reason_code, status_code=status.HTTP_409_CONFLICT
                )

            mechanic = cls._mechanic(campaign)
            rule = getattr(campaign, "rule", None)

            # SPEND mechanic requires a positive amount at/above the rule minimum.
            spend_amount: Decimal | None = None
            if mechanic == CampaignRule.Mechanic.SPEND:
                spend_amount = cls._validate_spend_amount(rule, amount_spend)

            action = CampaignAction.objects.create(
                campaign=campaign,
                participant=participant,
                customer=customer,
                business=campaign.business,
                action_type=action_type,
                verified_by_staff=staff,
                verification_method=verification_method,
                action_time=now,
                status=CampaignAction.Status.COUNTED,
                metadata=(
                    {"amount_spend": str(spend_amount)}
                    if spend_amount is not None
                    else {}
                ),
            )

            update_fields = ["last_progress_at", "status", "updated_at"]
            participant.last_progress_at = now
            if participant.status == CampaignParticipant.Status.JOINED:
                participant.status = CampaignParticipant.Status.IN_PROGRESS

            if mechanic == CampaignRule.Mechanic.SPEND:
                participant.current_spend = (
                    participant.current_spend or Decimal("0")
                ) + spend_amount
                update_fields.append("current_spend")
                required = (
                    rule.required_spend
                    if rule is not None and rule.required_spend is not None
                    else Decimal("0")
                )
                completed = bool(required) and participant.current_spend >= required
                progress_now = int(participant.current_spend)
                required_now = int(required)
            else:
                participant.progress_count += 1
                update_fields.append("progress_count")
                required_now = cls._required_count(campaign)
                completed = participant.progress_count >= required_now
                progress_now = participant.progress_count

            participant.save(update_fields=update_fields)

            emit_event(
                "campaign_visit_counted",
                business_id=str(campaign.business_id),
                customer_id=str(customer.id),
                campaign_id=str(campaign.id),
                progress=progress_now,
            )

            voucher: CampaignRewardVoucher | None = None
            if completed:
                # STAMP honours max_banked: a completion that would exceed the cap
                # of concurrently-banked ACTIVE vouchers mints nothing.
                if (
                    mechanic == CampaignRule.Mechanic.STAMP
                    and rule is not None
                    and rule.max_banked is not None
                    and cls._banked_voucher_count(campaign, customer)
                    >= rule.max_banked
                ):
                    completed = False
                else:
                    voucher = cls.complete_campaign(
                        campaign, participant, customer, now
                    )

            # Schedule the per-visit notification on commit (never inside atomic).
            campaign_id = str(campaign.id)
            customer_id = str(customer.id)
            transaction.on_commit(
                lambda: _schedule_visit_notification(customer_id, campaign_id)
            )

        return ProgressResult(
            campaign=campaign,
            participant=participant,
            action=action,
            completed=completed,
            progress_count=progress_now,
            required_count=required_now,
            voucher=voucher,
        )

    @staticmethod
    def _validate_spend_amount(
        rule: CampaignRule | None, amount_spend: Decimal | None
    ) -> Decimal:
        """Validate a SPEND action amount and return it as a positive Decimal.

        Raises ``VALIDATION_ERROR`` when no amount is supplied, the amount is not
        positive, or it falls below the rule's ``min_spend``. Money is always a
        ``Decimal`` — never a float. Source: campaigns-restructure design §3/§4.
        """
        if amount_spend is None:
            raise JaqynAPIException(
                "VALIDATION_ERROR",
                "A spend amount is required for a spend campaign",
                status.HTTP_400_BAD_REQUEST,
            )
        amount = Decimal(amount_spend)
        if amount <= 0:
            raise JaqynAPIException(
                "VALIDATION_ERROR",
                "Spend amount must be positive",
                status.HTTP_400_BAD_REQUEST,
            )
        if (
            rule is not None
            and rule.min_spend is not None
            and amount < rule.min_spend
        ):
            raise JaqynAPIException(
                "VALIDATION_ERROR",
                "Spend amount is below the minimum",
                status.HTTP_400_BAD_REQUEST,
            )
        return amount

    @classmethod
    def complete_campaign(
        cls,
        campaign: Campaign,
        participant: CampaignParticipant,
        customer,
        now: datetime | None = None,
    ) -> CampaignRewardVoucher:
        """Finish a cycle: mark the participant complete and issue the voucher (§19).

        Must be called inside the caller's atomic block **with the campaign row
        already locked** (``record_campaign_action`` and the group flow both
        ``select_for_update`` the ``Campaign`` before calling this). It shares that
        visit transaction. Re-checks the reward cap under the campaign lock before
        minting — ``CampaignEligibilityService.check_reward_limit`` counts the
        non-cancelled vouchers issued so far, and because the count runs while the
        campaign row is held, two concurrent final-slot completions are serialised:
        the first mints the last voucher, the second sees the cap reached and is
        rejected with ``CAMPAIGN_REWARD_LIMIT_REACHED`` rather than overshooting
        ``max_rewards``. Sets the participant to COMPLETED and stamps
        ``completed_at``. Mints exactly one :class:`CampaignRewardVoucher` via
        ``CampaignRewardService.issue_reward_voucher`` and schedules the
        reward-unlocked notification via ``transaction.on_commit``. For a
        REPEATABLE campaign it also bumps ``completion_cycle`` and resets
        ``progress_count`` to 0 so the same participant row can earn again.
        Raises ``VALIDATION_ERROR`` if the campaign has no reward configured.
        """
        now = now or timezone.now()
        reward = getattr(campaign, "reward", None)
        if reward is None:
            raise JaqynAPIException(
                "VALIDATION_ERROR",
                "Campaign has no reward configured",
                status.HTTP_409_CONFLICT,
            )

        # Re-check the reward cap under the held campaign lock. The cap was checked
        # in the eligibility pipeline, but only this locked re-read guarantees two
        # simultaneous final-slot completions cannot both pass and overshoot.
        if not CampaignEligibilityService.check_reward_limit(campaign):
            raise JaqynAPIException(
                "CAMPAIGN_REWARD_LIMIT_REACHED",
                status_code=status.HTTP_409_CONFLICT,
            )

        voucher = CampaignRewardService.issue_reward_voucher(
            campaign=campaign,
            reward=reward,
            customer=customer,
            participant=participant,
            now=now,
        )

        participant.status = CampaignParticipant.Status.COMPLETED
        participant.completed_at = now
        update_fields = ["status", "completed_at", "updated_at"]
        if campaign.completion_limit_per_customer == Campaign.CompletionLimit.REPEATABLE:
            participant.completion_cycle += 1
            participant.status = CampaignParticipant.Status.IN_PROGRESS
            update_fields += ["completion_cycle"]
            # Reset the counter that drives this campaign's mechanic so the same
            # participant row can earn again: SPEND subtracts the threshold from
            # current_spend (keeping any overflow), every other mechanic resets the
            # visit/stamp count. Source: campaigns-restructure design §4.
            rule = getattr(campaign, "rule", None)
            if (
                rule is not None
                and rule.mechanic == CampaignRule.Mechanic.SPEND
                and rule.required_spend is not None
            ):
                participant.current_spend = (
                    participant.current_spend or Decimal("0")
                ) - rule.required_spend
                update_fields += ["current_spend"]
            else:
                participant.progress_count = 0
                update_fields += ["progress_count"]
        participant.save(update_fields=update_fields)

        emit_event(
            "campaign_completed",
            business_id=str(campaign.business_id),
            customer_id=str(customer.id),
            campaign_id=str(campaign.id),
            voucher_id=str(voucher.id),
        )

        customer_id = str(customer.id)
        voucher_id = str(voucher.id)
        transaction.on_commit(
            lambda: _schedule_reward_notification(customer_id, voucher_id)
        )
        return voucher

    @classmethod
    def confirm_social_proof(
        cls,
        campaign: Campaign,
        customer,
        staff: StaffMember | None = None,
        now: datetime | None = None,
    ) -> ProgressResult:
        """Complete a SOCIAL campaign for a customer on staff-verified proof (§4).

        A SOCIAL campaign has no per-visit mechanic: a single staff-verified
        Instagram follow/tag proof completes it. Rejects a non-SOCIAL campaign
        (``VALIDATION_ERROR``). Auto-joins the customer when they have no
        participant row (so a staff member can confirm a walk-in), then re-runs the
        §13 eligibility pipeline under a participant lock. **Idempotent per
        (campaign, customer, cycle):** a customer already COMPLETED/REDEEMED for a
        ONCE campaign is rejected by the pipeline (``CAMPAIGN_ALREADY_COMPLETED``)
        so a double-confirm never mints a second voucher. On success it writes a
        COUNTED ``SOCIAL_PROOF`` ``CampaignAction``, then mints exactly one voucher
        via :meth:`complete_campaign` (which holds the campaign lock and re-checks
        the reward cap). Side effects are scheduled via ``transaction.on_commit``.
        """
        now = now or timezone.now()
        if campaign.campaign_type != Campaign.CampaignType.SOCIAL:
            raise JaqynAPIException(
                "VALIDATION_ERROR",
                "Only a social campaign accepts social proof",
                status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            campaign = cls._lock_campaign(campaign.id)
            participant = (
                CampaignParticipant.objects.select_for_update()
                .filter(campaign=campaign, customer=customer)
                .first()
            )
            if participant is None:
                cls.join_campaign(campaign, customer)
                participant = (
                    CampaignParticipant.objects.select_for_update()
                    .get(campaign=campaign, customer=customer)
                )

            result = CampaignEligibilityService.evaluate(
                campaign, customer.id, participant, now
            )
            if not result.eligible:
                raise JaqynAPIException(
                    result.reason_code, status_code=status.HTTP_409_CONFLICT
                )

            action = CampaignAction.objects.create(
                campaign=campaign,
                participant=participant,
                customer=customer,
                business=campaign.business,
                action_type=CampaignAction.ActionType.SOCIAL_PROOF,
                verified_by_staff=staff,
                verification_method=CampaignAction.VerificationMethod.STAFF_SCAN,
                action_time=now,
                status=CampaignAction.Status.COUNTED,
            )
            participant.last_progress_at = now
            participant.progress_count += 1
            if participant.status == CampaignParticipant.Status.JOINED:
                participant.status = CampaignParticipant.Status.IN_PROGRESS
            participant.save(
                update_fields=[
                    "progress_count",
                    "last_progress_at",
                    "status",
                    "updated_at",
                ]
            )
            voucher = cls.complete_campaign(campaign, participant, customer, now)

        emit_event(
            "campaign_social_proof_confirmed",
            business_id=str(campaign.business_id),
            customer_id=str(customer.id),
            campaign_id=str(campaign.id),
            voucher_id=str(voucher.id),
        )
        return ProgressResult(
            campaign=campaign,
            participant=participant,
            action=action,
            completed=True,
            progress_count=participant.progress_count,
            required_count=1,
            voucher=voucher,
        )


def _schedule_visit_notification(customer_id: str, campaign_id: str) -> None:
    """Enqueue the visit-counted notification task (on_commit callback)."""
    from apps.campaigns.tasks import notify_visit_counted

    notify_visit_counted.delay(customer_id, campaign_id)


def _schedule_reward_notification(customer_id: str, voucher_id: str) -> None:
    """Enqueue the reward-unlocked notification task (on_commit callback)."""
    from apps.campaigns.tasks import notify_reward_unlocked

    notify_reward_unlocked.delay(customer_id, voucher_id)
