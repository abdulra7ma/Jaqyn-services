from __future__ import annotations

from dataclasses import dataclass, field
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
class ActiveVoucherRow:
    """One redeemable voucher surfaced alongside the customer scan result.

    Carries the minimum info the staff redeem-from-scan UI needs: a stable
    ``id`` to pass to the redeem endpoint, the ``source`` tag so the FE routes
    to the right redeem endpoint, and a human-readable ``label`` derived from
    the reward title. ``expires_label`` is an ISO-8601 string when the voucher
    has an expiry, else ``None``.
    """

    id: str
    source: str  # "campaign" | "loyalty"
    label: str
    expires_label: str | None


@dataclass(frozen=True)
class GroupScanInfo:
    """Members + leader snapshot returned when staff scans a group-invite QR.

    The frontend group sheet renders: leader name, member list with per-member
    check-in status, and the ``n / m`` counter. This dataclass carries exactly
    that without extra queries beyond what ``resolve`` already loads.
    """

    group_session_id: str
    campaign_name: str
    required_size: int
    status: str
    leader_name: str
    members: list[dict]  # [{name, status, is_leader}]


@dataclass(frozen=True)
class UnifiedStaffScan:
    """Tagged unified scan result spanning loyalty and campaign domains."""

    kind: str
    customer: object | None = None
    loyalty: list[LoyaltyScanRow] | None = None
    campaigns: list[object] | None = None
    active_vouchers: list[ActiveVoucherRow] = field(default_factory=list)
    domain: str | None = None
    voucher: object | None = None
    group: GroupScanInfo | None = None
    reason_code: str | None = None


class UnifiedStaffScanService:
    """Read-only dispatcher for customer, voucher, and group-invite QR tokens."""

    @staticmethod
    def resolve(
        staff: StaffMember, raw_token: str, request: object | None = None
    ) -> UnifiedStaffScan:
        """Resolve one token and aggregate domain read models without applying rewards.

        Dispatches by QR token type:

        * ``CUSTOMER_PROFILE`` → ``kind="customer"`` with loyalty rows, campaign
          chooser rows (GROUP campaigns excluded — they complete via confirm-group),
          and the customer's ACTIVE vouchers at this business so the staff UI can
          offer redeem-from-scan without a second scan.
        * ``LOYALTY_REWARD`` → ``kind="voucher"`` with the loyalty voucher.
        * ``CAMPAIGN_REWARD`` → ``kind="voucher"`` with the campaign voucher.
        * ``GROUP_INVITE`` → ``kind="group"`` with leader name, member list
          (name + check-in status), and the ``n/m`` counter data so the frontend
          group sheet can render without a follow-up request.
        * anything else → ``kind="invalid"``.
        """
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

            # Collect the customer's ACTIVE vouchers at this business so the
            # staff can offer redeem-from-scan without a second QR scan.
            active_vouchers = UnifiedStaffScanService._active_vouchers_for_customer(
                token.customer, staff.business
            )

            return UnifiedStaffScan(
                kind="customer",
                customer=token.customer,
                loyalty=loyalty,
                campaigns=list(campaign_result.campaigns),
                active_vouchers=active_vouchers,
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
            group = (
                Group.objects.select_related("campaign", "group_leader")
                .prefetch_related("members__customer")
                .filter(invite_token=raw_token)
                .first()
            )
            if group is None:
                return UnifiedStaffScan(kind="invalid", reason_code="INVALID_QR_TOKEN")
            return UnifiedStaffScan(
                kind="group",
                group=UnifiedStaffScanService._build_group_info(group),
            )
        return UnifiedStaffScan(kind="invalid", reason_code="INVALID_QR_TOKEN")

    @staticmethod
    def _active_vouchers_for_customer(
        customer: object, business: object
    ) -> list[ActiveVoucherRow]:
        """Return ACTIVE campaign + loyalty vouchers for this customer+business pair.

        Two queries (one per domain); both filtered at the DB so no vouchers from
        other businesses or expired/redeemed rows are loaded. Loyalty vouchers
        still awaiting the customer's item choice (``item_selection=CUSTOMER``
        with no ``catalog_item``) are excluded — staff redemption of those always
        fails with VOUCHER_ITEM_NOT_SELECTABLE, so offering them at the till is a
        dead end. The result is ordered by issued_at descending so the most
        recent voucher appears first.
        """
        rows: list[ActiveVoucherRow] = []

        campaign_vouchers = CampaignRewardVoucher.objects.filter(
            customer=customer,
            business=business,
            status=CampaignRewardVoucher.Status.ACTIVE,
        ).select_related("reward").order_by("-issued_at")
        for v in campaign_vouchers:
            reward = getattr(v, "reward", None)
            label = reward.title if reward is not None else "Reward"
            rows.append(
                ActiveVoucherRow(
                    id=str(v.id),
                    source="campaign",
                    label=label,
                    expires_label=v.expires_at.isoformat() if v.expires_at else None,
                )
            )

        loyalty_vouchers = (
            LoyaltyVoucher.objects.filter(
                customer=customer,
                business=business,
                status=LoyaltyVoucher.Status.ACTIVE,
            )
            .exclude(
                program__item_selection=LoyaltyProgram.ItemSelection.CUSTOMER,
                catalog_item__isnull=True,
            )
            .order_by("-issued_at")
        )
        for lv in loyalty_vouchers:
            rows.append(
                ActiveVoucherRow(
                    id=str(lv.id),
                    source="loyalty",
                    label=lv.reward_title or "Reward",  # type: ignore[attr-defined]
                    expires_label=lv.expires_at.isoformat() if lv.expires_at else None,  # type: ignore[attr-defined]
                )
            )

        return rows

    @staticmethod
    def _build_group_info(group: Group) -> GroupScanInfo:
        """Shape a Group ORM instance into the GroupScanInfo the scan response renders.

        Members are ordered: leader first, then others alphabetically so the
        staff sees a stable list across scans. ``is_leader`` is the flag the
        FE needs to mark the leader row visually.
        """
        leader = group.group_leader
        members = []
        for m in group.members.all():  # type: ignore[attr-defined]
            members.append(
                {
                    "name": getattr(m.customer, "name", None) or "Customer",
                    "status": m.status,
                    "is_leader": m.customer_id == leader.id,  # type: ignore[attr-defined]
                }
            )
        # Leader first, rest alphabetical.
        members.sort(key=lambda m: (not m["is_leader"], m["name"]))
        return GroupScanInfo(
            group_session_id=str(group.id),
            campaign_name=group.campaign.name,
            required_size=group.required_size,
            status=group.status,
            leader_name=getattr(leader, "name", None) or "Leader",
            members=members,
        )
