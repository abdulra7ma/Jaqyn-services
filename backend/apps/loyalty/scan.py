from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from apps.campaigns.models import CampaignRewardVoucher, Group
from apps.campaigns.services import StaffScannerService
from apps.loyalty.models import LoyaltyMembership, LoyaltyProgram, LoyaltyVoucher
from apps.qr.models import QRCodeToken
from apps.qr.services import resolve_qr_token
from apps.staff.models import StaffMember


@dataclass(frozen=True)
class LoyaltyScanRow:
    """One active card option shown after scanning a customer."""

    program_id: str
    name: str
    type: str
    reward_title: str
    stamps_count: int
    visits_count: int
    required_count: int | None
    points_balance: int
    points_per_som: Decimal | None
    points_per_visit: int | None
    cashback_per_point: Decimal | None
    pct_back: Decimal | None
    current_spend: Decimal
    needs_amount: bool


@dataclass(frozen=True)
class UnifiedStaffScan:
    """Tagged unified scan result spanning loyalty and campaign domains."""

    kind: str
    customer: object | None = None
    loyalty: list[LoyaltyScanRow] | None = None
    campaigns: list[object] | None = None
    domain: str | None = None
    voucher: object | None = None
    group: object | None = None
    reason_code: str | None = None


class UnifiedStaffScanService:
    """Read-only dispatcher for customer, voucher, and group-invite QR tokens."""

    @staticmethod
    def resolve(
        staff: StaffMember, raw_token: str, request: object | None = None
    ) -> UnifiedStaffScan:
        """Resolve one token and aggregate domain read models without applying rewards."""
        try:
            token = resolve_qr_token(raw_token, request, action="unified_staff_scan")
        except Exception as exc:
            return UnifiedStaffScan(
                kind="invalid", reason_code=getattr(exc, "code", "INVALID_QR_TOKEN")
            )
        if token.type == QRCodeToken.Type.CUSTOMER_PROFILE and token.customer:
            campaign_result = StaffScannerService.scan_customer_qr(
                staff, raw_token, request=request
            )
            programs = LoyaltyProgram.objects.filter(
                business=staff.business, status=LoyaltyProgram.Status.ACTIVE
            ).select_related("business")
            memberships = {
                row.program_id: row
                for row in LoyaltyMembership.objects.filter(
                    customer=token.customer, program__in=programs
                )
            }
            loyalty = []
            for program in programs:
                membership = memberships.get(program.id)
                pct_back = (
                    program.points_per_som * program.cashback_per_point * Decimal("100")
                    if program.points_per_som is not None
                    and program.cashback_per_point is not None
                    else None
                )
                loyalty.append(
                    LoyaltyScanRow(
                        program_id=str(program.id),
                        name=program.name,
                        type=program.type,
                        reward_title=program.reward_title,
                        stamps_count=membership.stamps_count if membership else 0,
                        visits_count=membership.visits_count if membership else 0,
                        required_count=program.required_count,
                        points_balance=membership.points_balance if membership else 0,
                        points_per_som=program.points_per_som,
                        points_per_visit=program.points_per_visit,
                        cashback_per_point=program.cashback_per_point,
                        pct_back=pct_back,
                        current_spend=membership.current_spend
                        if membership
                        else Decimal("0"),
                        needs_amount=program.type == LoyaltyProgram.Type.POINTS
                        and program.points_basis == LoyaltyProgram.PointsBasis.SPEND,
                    )
                )
            return UnifiedStaffScan(
                kind="customer",
                customer=token.customer,
                loyalty=loyalty,
                campaigns=list(campaign_result.campaigns),
            )
        if token.type == QRCodeToken.Type.LOYALTY_REWARD:
            return UnifiedStaffScan(
                kind="voucher",
                domain="loyalty",
                voucher=LoyaltyVoucher.objects.filter(qr_token=token).first(),
            )
        if token.type == QRCodeToken.Type.CAMPAIGN_REWARD:
            return UnifiedStaffScan(
                kind="voucher",
                domain="campaign",
                voucher=CampaignRewardVoucher.objects.filter(qr_token=token).first(),
            )
        if token.type == QRCodeToken.Type.GROUP_INVITE:
            return UnifiedStaffScan(
                kind="group", group=Group.objects.filter(invite_token=raw_token).first()
            )
        return UnifiedStaffScan(kind="invalid", reason_code="INVALID_QR_TOKEN")
