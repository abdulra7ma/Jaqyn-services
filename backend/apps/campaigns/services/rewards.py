"""Campaign reward voucher lifecycle (plan §1.2 / §19).

Mints, validates, redeems, expires, and cancels :class:`CampaignRewardVoucher`
rows. Mirrors the loyalty redemption patterns (code alphabet, QR-token mint,
redeem-under-lock) but on the campaign voucher table, which carries its own
statuses and a 7-day-after-unlock expiry (plan D4).

Failures are signalled by raising ``JaqynAPIException`` with a code from
``core.exceptions.ERROR_MESSAGES`` — never by returning a sentinel.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import status

from apps.campaigns.constants import (
    DEFAULT_VOUCHER_EXPIRY_DAYS,
    VOUCHER_CODE_ALPHABET,
    VOUCHER_CODE_LENGTH,
    VOUCHER_EXPIRY_WARNING_HOURS,
)
from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
)
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import create_token
from apps.reporting.models import AdminAuditLog
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException
from core.logging import emit_event, log_scan


def _generate_voucher_code() -> str:
    """Return a random voucher code over the unambiguous alphabet (plan §1.1)."""
    return "".join(
        secrets.choice(VOUCHER_CODE_ALPHABET) for _ in range(VOUCHER_CODE_LENGTH)
    )


class CampaignRewardService:
    """Issue and redeem campaign reward vouchers (plan §1.2 / §19).

    All mutating methods take a database lock on the voucher row before changing
    its status (``select_for_update``) so two concurrent redemptions cannot both
    succeed. Issuance is expected to run inside the caller's atomic block (the
    completion path mints the voucher in the same transaction that flips the
    participant to COMPLETED).
    """

    @staticmethod
    def issue_reward_voucher(
        campaign: Campaign,
        reward: CampaignReward,
        customer,
        participant: CampaignParticipant | None = None,
        now=None,
    ) -> CampaignRewardVoucher:
        """Mint one ACTIVE voucher for a completed campaign (plan §1.2).

        Generates a collision-free code, sets ``expires_at`` to ``now`` plus the
        reward's ``expiry_days_after_unlock`` (falling back to
        ``DEFAULT_VOUCHER_EXPIRY_DAYS`` when the reward does not set its own), and
        mints a ``CAMPAIGN_REWARD`` QR token bound to the voucher for staff
        redemption. For an item reward (multi-form-loyalty design §1) the voucher's
        ``catalog_item`` is set up-front when ``reward.item_selection == fixed`` (the
        business preset the item); when ``customer`` it is left null until the
        customer picks one via :meth:`select_voucher_item` at present time. Must be
        called inside an atomic block by the completion path, which holds the
        ``Campaign`` row lock and has already re-checked the reward cap under that
        lock (see ``CampaignProgressService.complete_campaign``); this method does
        not itself re-check the cap.
        """
        now = now or timezone.now()
        code = _generate_voucher_code()
        while CampaignRewardVoucher.objects.filter(voucher_code=code).exists():
            code = _generate_voucher_code()

        expiry_days = reward.expiry_days_after_unlock or DEFAULT_VOUCHER_EXPIRY_DAYS
        expires_at = now + timedelta(days=expiry_days)

        # A fixed-item reward stamps the preset CatalogItem onto the voucher now;
        # a customer-choice reward leaves it null until the customer selects.
        catalog_item = (
            reward.catalog_item
            if reward.item_selection == CampaignReward.ItemSelection.FIXED
            else None
        )

        voucher = CampaignRewardVoucher.objects.create(
            campaign=campaign,
            customer=customer,
            business=campaign.business,
            reward=reward,
            participant=participant,
            voucher_code=code,
            status=CampaignRewardVoucher.Status.ACTIVE,
            issued_at=now,
            expires_at=expires_at,
            catalog_item=catalog_item,
        )
        token = create_token(
            QRCodeToken.Type.CAMPAIGN_REWARD,
            business=campaign.business,
            customer=customer,
            campaign=campaign.id,
            expires_at=expires_at,
        )
        voucher.qr_token = token
        voucher.save(update_fields=["qr_token", "updated_at"])

        emit_event(
            "campaign_reward_issued",
            business_id=str(campaign.business_id),
            customer_id=str(customer.id),
            campaign_id=str(campaign.id),
            voucher_id=str(voucher.id),
        )
        # Enqueue patch evaluation for the card_completed event. Must run outside
        # the caller's atomic block via on_commit. Source: spec §A "loyalty/campaign
        # voucher issued → card_completed"; backend.md Celery rule.
        customer_id_str = str(customer.id)
        business_category = campaign.business.category if campaign.business else ""
        from django.db import transaction as _tx

        _tx.on_commit(
            lambda: _enqueue_card_completed_patch(
                customer_id_str, str(campaign.business_id), business_category
            )
        )
        return voucher

    @classmethod
    def select_voucher_item(
        cls, voucher_id, customer, catalog_item_id
    ) -> CampaignRewardVoucher:
        """Pick the CatalogItem for a customer-choice item voucher (§1).

        Only valid for the voucher's owner, an unredeemed (ACTIVE) voucher whose
        reward has ``item_selection == customer`` (``VOUCHER_ITEM_NOT_SELECTABLE``
        otherwise — a fixed-item, cashback, or non-item voucher cannot be re-chosen).
        Validates that the chosen ``catalog_item_id`` is an active CatalogItem of the
        campaign's *own* business (``CATALOG_ITEM_NOT_FOUND`` otherwise — this is the
        cross-business guard so a customer cannot attach another business's item).
        Sets ``voucher.catalog_item`` under a row lock and returns the voucher.
        Raises ``VOUCHER_NOT_FOUND`` when the voucher is not the customer's.
        """
        from apps.businesses.models import CatalogItem

        with transaction.atomic():
            try:
                voucher = (
                    CampaignRewardVoucher.objects.select_for_update()
                    .select_related("reward", "business", "campaign")
                    .get(id=voucher_id, customer=customer)
                )
            except CampaignRewardVoucher.DoesNotExist:
                raise JaqynAPIException(
                    "VOUCHER_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
                )
            if voucher.status != CampaignRewardVoucher.Status.ACTIVE:
                raise JaqynAPIException(
                    "VOUCHER_NOT_ACTIVE", status_code=status.HTTP_400_BAD_REQUEST
                )
            reward = voucher.reward
            if (
                reward is None
                or reward.item_selection != CampaignReward.ItemSelection.CUSTOMER
            ):
                raise JaqynAPIException(
                    "VOUCHER_ITEM_NOT_SELECTABLE",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            item = CatalogItem.objects.filter(
                id=catalog_item_id,
                business_id=voucher.business_id,
                is_active=True,
            ).first()
            if item is None:
                raise JaqynAPIException(
                    "CATALOG_ITEM_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
                )
            voucher.catalog_item = item
            voucher.save(update_fields=["catalog_item", "updated_at"])
        return voucher

    @staticmethod
    def eligible_catalog_items(campaign: Campaign):
        """Return the active CatalogItems a customer may pick for ``campaign`` (§1).

        The selectable set is the campaign's business's active catalog, newest
        sort-order first (CatalogItem's own ``Meta.ordering``). Returned as a
        queryset so the view paginates it; no item from another business is ever
        included (the cross-business guard is enforced again at selection).
        """
        from apps.businesses.models import CatalogItem

        return CatalogItem.objects.filter(
            business_id=campaign.business_id, is_active=True
        )

    @staticmethod
    def _voucher_from_code_or_token(
        code: str | None = None,
        token: str | None = None,
        voucher_id: object | None = None,
        request: object | None = None,
    ) -> tuple[CampaignRewardVoucher, QRCodeToken | None]:
        """Resolve a voucher from a redeem QR token, typed-in code, or voucher id.

        Raises ``VOUCHER_NOT_FOUND`` when none of the three resolves. A QR
        token must be of type ``CAMPAIGN_REWARD`` and point at an existing
        campaign voucher. ``voucher_id`` is the UUID surfaced in the
        scan-customer ``active_vouchers`` list; the business-ownership check
        runs in ``_assert_redeemable`` / the lock block, not here.
        """
        from apps.qr.services import resolve_qr_token

        if token:
            qr_token = resolve_qr_token(token, request, action="campaign_redeem")
            if qr_token.type != QRCodeToken.Type.CAMPAIGN_REWARD:
                raise JaqynAPIException(
                    "VOUCHER_NOT_FOUND", status_code=status.HTTP_400_BAD_REQUEST
                )
            voucher = (
                CampaignRewardVoucher.objects.select_related(
                    "campaign", "business", "reward", "customer"
                )
                .filter(qr_token=qr_token)
                .first()
            )
            if voucher is None:
                raise JaqynAPIException(
                    "VOUCHER_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
                )
            return voucher, qr_token
        if voucher_id is not None:
            try:
                return (
                    CampaignRewardVoucher.objects.select_related(
                        "campaign", "business", "reward", "customer"
                    ).get(id=voucher_id),
                    None,
                )
            except CampaignRewardVoucher.DoesNotExist:
                raise JaqynAPIException(
                    "VOUCHER_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
                )
        try:
            return (
                CampaignRewardVoucher.objects.select_related(
                    "campaign", "business", "reward", "customer"
                ).get(voucher_code=code),
                None,
            )
        except CampaignRewardVoucher.DoesNotExist:
            raise JaqynAPIException(
                "VOUCHER_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
            )

    @classmethod
    def validate_reward_voucher(
        cls,
        staff: StaffMember,
        code: str | None = None,
        token: str | None = None,
        voucher_id: object | None = None,
        request: object | None = None,
    ) -> CampaignRewardVoucher:
        """Resolve and validate a voucher for redemption without redeeming it (§19).

        Enforces the redemption preconditions read-only: the voucher exists,
        belongs to the staff member's business (``WRONG_BUSINESS``), is ACTIVE
        (``VOUCHER_ALREADY_REDEEMED`` / ``VOUCHER_CANCELLED`` /
        ``VOUCHER_NOT_ACTIVE``), and has not passed ``expires_at``
        (``VOUCHER_EXPIRED``). Returns the voucher when valid; raises otherwise.
        Does not take a lock — use :meth:`redeem_reward_voucher` to actually
        flip the status.

        ``voucher_id`` accepts the UUID from the scan-customer
        ``active_vouchers`` list so the staff can validate without a second QR
        scan; business-ownership is enforced by ``_assert_redeemable``.
        """
        voucher, _ = cls._voucher_from_code_or_token(
            code=code, token=token, voucher_id=voucher_id, request=request
        )
        cls._assert_redeemable(voucher, staff)
        return voucher

    @staticmethod
    def _assert_redeemable(voucher: CampaignRewardVoucher, staff: StaffMember) -> None:
        """Raise the appropriate domain error if the voucher cannot be redeemed (§19)."""
        if voucher.business_id != staff.business_id:
            raise JaqynAPIException(
                "WRONG_BUSINESS",
                "Voucher belongs to another business",
                status.HTTP_403_FORBIDDEN,
            )
        if voucher.status == CampaignRewardVoucher.Status.REDEEMED:
            raise JaqynAPIException(
                "VOUCHER_ALREADY_REDEEMED", status_code=status.HTTP_409_CONFLICT
            )
        if voucher.status == CampaignRewardVoucher.Status.CANCELLED:
            raise JaqynAPIException(
                "VOUCHER_CANCELLED", status_code=status.HTTP_400_BAD_REQUEST
            )
        if voucher.status == CampaignRewardVoucher.Status.EXPIRED:
            raise JaqynAPIException(
                "VOUCHER_EXPIRED", status_code=status.HTTP_400_BAD_REQUEST
            )
        if voucher.status != CampaignRewardVoucher.Status.ACTIVE:
            raise JaqynAPIException(
                "VOUCHER_NOT_ACTIVE", status_code=status.HTTP_400_BAD_REQUEST
            )
        if voucher.expires_at is not None and voucher.expires_at <= timezone.now():
            raise JaqynAPIException(
                "VOUCHER_EXPIRED", status_code=status.HTTP_400_BAD_REQUEST
            )

    @classmethod
    def redeem_reward_voucher(
        cls,
        staff: StaffMember,
        code: str | None = None,
        token: str | None = None,
        voucher_id: object | None = None,
        request: object | None = None,
    ) -> CampaignRewardVoucher:
        """Redeem a voucher under a row lock, flipping it ACTIVE → REDEEMED (§19).

        Accepts a ``voucher_id`` (UUID from the scan-customer ``active_vouchers``
        list) in addition to the existing ``token``/``code`` paths so the staff
        can redeem straight from the scan sheet.

        Re-fetches the voucher ``select_for_update`` inside an atomic block, then
        re-checks every precondition (business match, status ACTIVE, not expired)
        *under the lock* so two concurrent redemptions cannot both win — the
        second sees REDEEMED and is rejected with ``VOUCHER_ALREADY_REDEEMED``.
        On success sets ``status=REDEEMED``, ``redeemed_at``, ``redeemed_by_staff``
        and also flips the owning participant to REDEEMED. Logs the scan to
        ``ScanLog`` either way (success or block).
        """
        voucher, qr_token = cls._voucher_from_code_or_token(
            code=code, token=token, voucher_id=voucher_id, request=request
        )

        error_code: str | None = None
        with transaction.atomic():
            locked = (
                CampaignRewardVoucher.objects.select_for_update()
                .select_related("campaign", "business", "reward", "customer")
                .get(id=voucher.id)
            )
            now = timezone.now()
            if locked.business_id != staff.business_id:
                error_code = "WRONG_BUSINESS"
            elif locked.status == CampaignRewardVoucher.Status.REDEEMED:
                error_code = "VOUCHER_ALREADY_REDEEMED"
            elif locked.status == CampaignRewardVoucher.Status.CANCELLED:
                error_code = "VOUCHER_CANCELLED"
            elif locked.expires_at is not None and locked.expires_at <= now:
                # Lazily flip to EXPIRED so the wallet reflects reality immediately.
                if locked.status == CampaignRewardVoucher.Status.ACTIVE:
                    locked.status = CampaignRewardVoucher.Status.EXPIRED
                    locked.save(update_fields=["status", "updated_at"])
                error_code = "VOUCHER_EXPIRED"
            elif locked.status != CampaignRewardVoucher.Status.ACTIVE:
                error_code = "VOUCHER_NOT_ACTIVE"
            else:
                locked.status = CampaignRewardVoucher.Status.REDEEMED
                locked.redeemed_at = now
                locked.redeemed_by_staff = staff
                locked.save(
                    update_fields=[
                        "status",
                        "redeemed_at",
                        "redeemed_by_staff",
                        "updated_at",
                    ]
                )
                if locked.participant_id is not None:
                    CampaignParticipant.objects.filter(id=locked.participant_id).update(
                        status=CampaignParticipant.Status.REDEEMED,
                        updated_at=now,
                    )
                if locked.qr_token_id is not None:
                    QRCodeToken.objects.filter(id=locked.qr_token_id).update(
                        is_active=False
                    )
                voucher = locked

        if error_code is not None:
            status_map = {
                "WRONG_BUSINESS": status.HTTP_403_FORBIDDEN,
                "VOUCHER_ALREADY_REDEEMED": status.HTTP_409_CONFLICT,
                "VOUCHER_CANCELLED": status.HTTP_400_BAD_REQUEST,
                "VOUCHER_EXPIRED": status.HTTP_400_BAD_REQUEST,
                "VOUCHER_NOT_ACTIVE": status.HTTP_400_BAD_REQUEST,
            }
            log_scan(
                qr_token=qr_token,
                token_value=token or code,
                staff=staff,
                business=staff.business,
                action="campaign_redeem_voucher",
                status=ScanLog.Status.BLOCKED,
                failure_reason=error_code,
            )
            raise JaqynAPIException(error_code, status_code=status_map[error_code])

        log_scan(
            qr_token=qr_token,
            token_value=token or code,
            staff=staff,
            business=staff.business,
            customer=voucher.customer,
            action="campaign_redeem_voucher",
            status=ScanLog.Status.SUCCESS,
        )
        emit_event(
            "campaign_reward_redeemed",
            business_id=str(voucher.business_id),
            customer_id=str(voucher.customer_id),
            staff_id=str(staff.id),
            voucher_id=str(voucher.id),
        )
        # Enqueue patch evaluation for the reward_redeemed event after the
        # redemption transaction commits. Source: spec §A hook; backend.md rule.
        _enqueue_patch_evaluation_for_redeem(
            str(voucher.customer_id),
            {"business_id": str(voucher.business_id)},
        )
        return voucher

    # Voucher statuses surfaced as the customer wallet "active" group. Source:
    # plan §2.2 (Wallet — Active / Used / Expired). Only ACTIVE is presentable.
    _WALLET_ACTIVE_STATUSES = frozenset({CampaignRewardVoucher.Status.ACTIVE})

    @staticmethod
    def wallet_for_customer(customer):
        """Return a customer's campaign vouchers newest-first (queryset, plan §2.2).

        Backs the campaign wallet. The Active/Used/Expired grouping is the view's
        concern; this returns every voucher with its campaign/business/reward
        joined to keep the wallet serializer free of N+1 queries.
        """
        return (
            CampaignRewardVoucher.objects.filter(customer=customer)
            .select_related(
                "campaign", "business", "reward", "qr_token", "catalog_item"
            )
            .order_by("-issued_at", "-created_at")
        )

    @staticmethod
    def get_customer_voucher(voucher_id, customer) -> CampaignRewardVoucher:
        """Load one of the customer's vouchers with relations, or raise (plan §2.2).

        Raises ``VOUCHER_NOT_FOUND`` when the voucher does not exist or is not
        owned by ``customer`` (the two are indistinguishable so a customer cannot
        probe another's voucher ids).
        """
        try:
            return CampaignRewardVoucher.objects.select_related(
                "campaign", "business", "reward", "qr_token", "catalog_item"
            ).get(id=voucher_id, customer=customer)
        except CampaignRewardVoucher.DoesNotExist:
            raise JaqynAPIException(
                "VOUCHER_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
            )

    @classmethod
    def present_voucher(cls, voucher_id, customer) -> CampaignRewardVoucher:
        """Surface a voucher for the "waiting for staff" present state (plan §2.2).

        Loads the customer's own voucher and asserts it is still ACTIVE and not
        past ``expires_at`` so the present screen never shows a dead QR: a
        REDEEMED voucher raises ``VOUCHER_ALREADY_REDEEMED``, a CANCELLED one
        ``VOUCHER_CANCELLED``, and an overdue one ``VOUCHER_EXPIRED`` (lazily
        flipped to EXPIRED so the wallet reflects reality). On success returns the
        voucher unchanged — the model carries no ``presented_at`` field; the
        customer screen polls the voucher until staff redeem it.
        """
        voucher = cls.get_customer_voucher(voucher_id, customer)
        now = timezone.now()
        if voucher.status == CampaignRewardVoucher.Status.REDEEMED:
            raise JaqynAPIException(
                "VOUCHER_ALREADY_REDEEMED", status_code=status.HTTP_409_CONFLICT
            )
        if voucher.status == CampaignRewardVoucher.Status.CANCELLED:
            raise JaqynAPIException(
                "VOUCHER_CANCELLED", status_code=status.HTTP_400_BAD_REQUEST
            )
        if voucher.expires_at is not None and voucher.expires_at <= now:
            if voucher.status == CampaignRewardVoucher.Status.ACTIVE:
                voucher.status = CampaignRewardVoucher.Status.EXPIRED
                voucher.save(update_fields=["status", "updated_at"])
            raise JaqynAPIException(
                "VOUCHER_EXPIRED", status_code=status.HTTP_400_BAD_REQUEST
            )
        if voucher.status != CampaignRewardVoucher.Status.ACTIVE:
            raise JaqynAPIException(
                "VOUCHER_NOT_ACTIVE", status_code=status.HTTP_400_BAD_REQUEST
            )
        return voucher

    @staticmethod
    def vouchers_for_campaign(campaign: Campaign):
        """Return a campaign's vouchers newest-first for the business list (queryset).

        ``redeemed_by_staff`` is select-related so
        ``CampaignRewardVoucherSerializer.get_redeemed_by`` can resolve the
        staff member name without an extra query per row.
        """
        return (
            CampaignRewardVoucher.objects.filter(campaign=campaign)
            .select_related(
                "customer",
                "reward",
                "business",
                "qr_token",
                "redeemed_by_staff",
                "catalog_item",
            )
            .order_by("-issued_at", "-created_at")
        )

    @staticmethod
    def expire_vouchers(now=None) -> int:
        """Mark every overdue ACTIVE voucher EXPIRED in one batch (plan §1.4).

        Idempotent: only ACTIVE vouchers with ``expires_at <= now`` are touched,
        so re-running is a no-op. Returns the number of vouchers expired. Called
        by the hourly ``expire_campaign_vouchers`` Celery task.
        """
        now = now or timezone.now()
        return CampaignRewardVoucher.objects.filter(
            status=CampaignRewardVoucher.Status.ACTIVE,
            expires_at__lte=now,
        ).update(status=CampaignRewardVoucher.Status.EXPIRED, updated_at=now)

    @staticmethod
    def claim_vouchers_to_warn(now=None) -> list[str]:
        """Claim ACTIVE vouchers due for an "expiring soon" nudge (plan §1.4).

        Selects ACTIVE vouchers whose ``expires_at`` falls inside the next
        ``VOUCHER_EXPIRY_WARNING_HOURS`` and that have not already been warned
        (``expiry_warned_at`` is null), stamps ``expiry_warned_at`` under a row
        lock in one atomic block, and returns their ids. Stamping while holding the
        lock makes the periodic ``notify_vouchers_expiring_soon`` task idempotent:
        a concurrent or repeated run claims nothing already warned, so a customer
        is nudged at most once per voucher. Vouchers already past ``expires_at`` are
        excluded — those are the expiry task's job, not a warning.
        """
        now = now or timezone.now()
        horizon = now + timedelta(hours=VOUCHER_EXPIRY_WARNING_HOURS)
        with transaction.atomic():
            ids = list(
                CampaignRewardVoucher.objects.select_for_update(skip_locked=True)
                .filter(
                    status=CampaignRewardVoucher.Status.ACTIVE,
                    expiry_warned_at__isnull=True,
                    expires_at__gt=now,
                    expires_at__lte=horizon,
                )
                .values_list("id", flat=True)
            )
            if ids:
                CampaignRewardVoucher.objects.filter(id__in=ids).update(
                    expiry_warned_at=now, updated_at=now
                )
        return [str(voucher_id) for voucher_id in ids]

    @staticmethod
    def cancel_voucher(
        voucher_id, manager: StaffMember, reason: str
    ) -> CampaignRewardVoucher:
        """Cancel a single ACTIVE voucher (manager-only, requires a reason).

        Only a StaffMember with the MANAGER role may cancel, and only a voucher
        belonging to the manager's business (``PERMISSION_DENIED`` /
        ``WRONG_BUSINESS``). A blank reason is rejected (``VALIDATION_ERROR``).
        Already-redeemed/expired/cancelled vouchers cannot be cancelled
        (``VOUCHER_NOT_ACTIVE``). On success sets ``status=CANCELLED`` and
        ``cancel_reason``, deactivates the QR token, and writes an
        ``AdminAuditLog`` row. Already-issued ACTIVE vouchers survive a campaign
        cancellation; this is the only path that revokes one (plan Q5).
        """
        if manager.role != StaffMember.Role.MANAGER:
            raise JaqynAPIException(
                "PERMISSION_DENIED",
                "Only a manager can cancel a voucher",
                status.HTTP_403_FORBIDDEN,
            )
        if not reason or not reason.strip():
            raise JaqynAPIException(
                "VALIDATION_ERROR",
                "A cancellation reason is required",
                status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            try:
                voucher = CampaignRewardVoucher.objects.select_for_update().get(
                    id=voucher_id
                )
            except CampaignRewardVoucher.DoesNotExist:
                raise JaqynAPIException(
                    "VOUCHER_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
                )
            if voucher.business_id != manager.business_id:
                raise JaqynAPIException(
                    "WRONG_BUSINESS",
                    "Voucher belongs to another business",
                    status.HTTP_403_FORBIDDEN,
                )
            if voucher.status != CampaignRewardVoucher.Status.ACTIVE:
                raise JaqynAPIException(
                    "VOUCHER_NOT_ACTIVE", status_code=status.HTTP_400_BAD_REQUEST
                )
            voucher.status = CampaignRewardVoucher.Status.CANCELLED
            voucher.cancel_reason = reason.strip()
            voucher.save(update_fields=["status", "cancel_reason", "updated_at"])
            if voucher.qr_token_id is not None:
                QRCodeToken.objects.filter(id=voucher.qr_token_id).update(
                    is_active=False
                )
            AdminAuditLog.objects.create(
                admin=manager.user,
                action="cancel_campaign_voucher",
                target_type="campaigns.CampaignRewardVoucher",
                target_id=str(voucher.id),
                reason=reason.strip(),
                metadata={
                    "campaign_id": str(voucher.campaign_id),
                    "staff_id": str(manager.id),
                },
            )

        emit_event(
            "campaign_voucher_cancelled",
            business_id=str(voucher.business_id),
            staff_id=str(manager.id),
            voucher_id=str(voucher.id),
        )
        return voucher


def _schedule_reward_notification(customer_id: str, voucher_id: str) -> None:
    """Enqueue the reward-unlocked notification task (on_commit callback).

    A cashback voucher minted by :meth:`CampaignRewardService.redeem_points`
    reuses the same reward-unlocked notification as a completion voucher, so the
    customer is told their reward is ready. Imported lazily and only delayed from
    an ``on_commit`` callback (never inside the atomic block) — the
    Celery-with-Postgres rule.
    """
    from apps.campaigns.tasks import notify_reward_unlocked

    notify_reward_unlocked.delay(customer_id, voucher_id)


def _enqueue_card_completed_patch(
    customer_id: str, business_id: str, category: str
) -> None:
    """Enqueue evaluate_patches for card_completed (campaign voucher issued).

    Called only from on_commit. Source: spec §A hooks; backend.md Celery rule.
    """
    from apps.patches.tasks import evaluate_patches

    evaluate_patches.delay(
        customer_id,
        "card_completed",
        {"business_id": business_id, "category": category},
    )


def _enqueue_patch_evaluation_for_redeem(customer_id: str, meta: dict) -> None:
    """Enqueue evaluate_patches for the reward_redeemed event (on_commit callback).

    Called only outside the atomic block to honour the Celery-with-Postgres rule.
    Source: spec §A "voucher redeemed → reward_redeemed"; backend.md Celery rule.
    """
    from django.db import transaction

    from apps.patches.tasks import evaluate_patches

    transaction.on_commit(
        lambda: evaluate_patches.delay(customer_id, "reward_redeemed", meta)
    )
