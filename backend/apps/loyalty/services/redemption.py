from __future__ import annotations

import secrets
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import CatalogItem
from apps.loyalty.models import (
    LoyaltyMembership,
    LoyaltyProgram,
    LoyaltyTransaction,
    LoyaltyVoucher,
)
from apps.qr.models import QRCodeToken
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException

# Sixteen random bytes produce a compact 32-character code with 128 bits of entropy.
_CODE_BYTES = 16


class LoyaltyRedemptionService:
    """Mint, configure, and atomically redeem loyalty vouchers and points."""

    @staticmethod
    def _code() -> str:
        """Generate a collision-resistant uppercase voucher code."""
        return secrets.token_hex(_CODE_BYTES).upper()

    @staticmethod
    def mint_voucher(membership: LoyaltyMembership) -> LoyaltyVoucher:
        """Mint the program's configured non-cashback reward and its scan token."""
        program = membership.program
        expires_at = timezone.now() + timezone.timedelta(
            days=program.reward_expiry_days
        )
        qr = QRCodeToken.objects.create(
            token=secrets.token_urlsafe(32),
            type=QRCodeToken.Type.LOYALTY_REWARD,
            business=program.business,
            customer=membership.customer,
            expires_at=expires_at,
        )
        return LoyaltyVoucher.objects.create(
            membership=membership,
            program=program,
            customer=membership.customer,
            business=program.business,
            voucher_code=LoyaltyRedemptionService._code(),
            reward_type=program.reward_type,
            reward_title=program.reward_title,
            catalog_item=program.catalog_item
            if program.item_selection == LoyaltyProgram.ItemSelection.FIXED
            else None,
            qr_token=qr,
            expires_at=expires_at,
        )

    @staticmethod
    @transaction.atomic
    def redeem_points(
        program: LoyaltyProgram, customer: User, points: int
    ) -> LoyaltyVoucher:
        """Deduct points under lock and mint a cashback voucher in one transaction."""
        if program.type != LoyaltyProgram.Type.POINTS or not program.cashback_per_point:
            raise JaqynAPIException(
                "CAMPAIGN_NOT_POINTS", "This loyalty program does not award points"
            )
        if points <= 0 or (
            program.min_redeem_points and points < program.min_redeem_points
        ):
            raise JaqynAPIException(
                "VALIDATION_ERROR", "Points are below the minimum redemption"
            )
        try:
            membership = (
                LoyaltyMembership.objects.select_for_update()
                .select_related("program__business", "customer")
                .get(program=program, customer=customer)
            )
        except LoyaltyMembership.DoesNotExist as exc:
            raise JaqynAPIException("INSUFFICIENT_POINTS") from exc
        if membership.points_balance < points:
            raise JaqynAPIException("INSUFFICIENT_POINTS")
        membership.points_balance -= points
        membership.last_activity_at = timezone.now()
        membership.save(
            update_fields=["points_balance", "last_activity_at", "updated_at"]
        )
        expires_at = timezone.now() + timezone.timedelta(
            days=program.reward_expiry_days
        )
        qr = QRCodeToken.objects.create(
            token=secrets.token_urlsafe(32),
            type=QRCodeToken.Type.LOYALTY_REWARD,
            business=program.business,
            customer=customer,
            expires_at=expires_at,
        )
        voucher = LoyaltyVoucher.objects.create(
            membership=membership,
            program=program,
            customer=customer,
            business=program.business,
            voucher_code=LoyaltyRedemptionService._code(),
            reward_type=LoyaltyProgram.RewardType.CASHBACK,
            reward_title=program.reward_title or "Cashback",
            cashback_amount=Decimal(points) * program.cashback_per_point,
            qr_token=qr,
            expires_at=expires_at,
        )
        LoyaltyTransaction.objects.create(
            membership=membership,
            program=program,
            customer=customer,
            business=program.business,
            kind=LoyaltyTransaction.Kind.REDEEM,
            source=LoyaltyTransaction.Source.SYSTEM,
            points_delta=-points,
            metadata={"voucher_id": str(voucher.id)},
        )
        return voucher

    @staticmethod
    def select_voucher_item(
        voucher: LoyaltyVoucher, item: CatalogItem, customer: User
    ) -> LoyaltyVoucher:
        """Select an item once for a customer-choice voucher from the same business."""
        if (
            voucher.customer_id != customer.id
            or voucher.program.item_selection != LoyaltyProgram.ItemSelection.CUSTOMER
            or voucher.catalog_item_id
        ):
            raise JaqynAPIException("VOUCHER_ITEM_NOT_SELECTABLE")
        if item.business_id != voucher.business_id:
            raise JaqynAPIException("CATALOG_ITEM_NOT_FOUND")
        voucher.catalog_item = item
        voucher.save(update_fields=["catalog_item"])
        return voucher

    @staticmethod
    @transaction.atomic
    def redeem_voucher(
        staff: StaffMember,
        code: str | None = None,
        voucher_id: object | None = None,
    ) -> LoyaltyVoucher:
        """Redeem an active, unexpired voucher belonging to the staff business.

        Accepts either a voucher code (typed-in or from QR scan) or the UUID
        from the scan-customer ``active_vouchers`` list so the staff can redeem
        straight from the scan sheet. Exactly one must be provided. The
        business-ownership check runs under the lock so an id from another
        business's scan is rejected with ``WRONG_BUSINESS``.
        """
        if voucher_id is not None:
            try:
                voucher = (
                    LoyaltyVoucher.objects.select_for_update()
                    .select_related("business", "program")
                    .get(id=voucher_id)
                )
            except LoyaltyVoucher.DoesNotExist as exc:
                raise JaqynAPIException("VOUCHER_NOT_FOUND", status_code=404) from exc
        else:
            try:
                voucher = (
                    LoyaltyVoucher.objects.select_for_update()
                    .select_related("business", "program")
                    .get(voucher_code=code)
                )
            except LoyaltyVoucher.DoesNotExist as exc:
                raise JaqynAPIException("VOUCHER_NOT_FOUND", status_code=404) from exc
        if voucher.business_id != staff.business_id:
            raise JaqynAPIException("WRONG_BUSINESS")
        if voucher.status != LoyaltyVoucher.Status.ACTIVE:
            raise JaqynAPIException(
                "VOUCHER_ALREADY_REDEEMED"
                if voucher.status == LoyaltyVoucher.Status.REDEEMED
                else "VOUCHER_NOT_ACTIVE"
            )
        if voucher.expires_at and voucher.expires_at <= timezone.now():
            voucher.status = LoyaltyVoucher.Status.EXPIRED
            voucher.save(update_fields=["status"])
            raise JaqynAPIException("VOUCHER_EXPIRED")
        if (
            voucher.program.item_selection == LoyaltyProgram.ItemSelection.CUSTOMER
            and not voucher.catalog_item_id
        ):
            raise JaqynAPIException(
                "VOUCHER_ITEM_NOT_SELECTABLE", "Choose an item before redemption"
            )
        voucher.status = LoyaltyVoucher.Status.REDEEMED
        voucher.redeemed_at = timezone.now()
        voucher.redeemed_by_staff = staff
        voucher.save(update_fields=["status", "redeemed_at", "redeemed_by_staff"])
        return voucher
