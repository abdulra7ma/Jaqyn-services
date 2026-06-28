from __future__ import annotations

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.businesses.models import Business, CatalogItem
from apps.loyalty.models import LoyaltyProgram, LoyaltyTransaction, LoyaltyVoucher
from apps.loyalty.serializers import (
    AwardSerializer,
    LoyaltyCardSerializer,
    LoyaltyProgramSerializer,
    LoyaltyProgramWriteSerializer,
    LoyaltyTransactionSerializer,
    LoyaltyVoucherSerializer,
    RedeemPointsSerializer,
    RedeemVoucherSerializer,
    SelectItemSerializer,
)
from apps.loyalty.services import (
    LoyaltyAnalyticsService,
    LoyaltyEarningService,
    LoyaltyMembershipService,
    LoyaltyProgramService,
    LoyaltyRedemptionService,
)
from apps.qr.services import resolve_qr_token
from apps.staff.services import get_staff_for_user
from core.exceptions import JaqynAPIException
from core.pagination import StandardResultsSetPagination
from core.permissions import IsBusinessOwner, IsCustomer, IsStaff
from core.response import success_response


class _WriteThrottleMixin:
    throttle_scope = "loyalty_write"

    def get_throttles(self):
        return [ScopedRateThrottle()]


def _owner_program(request: object, program_id: object) -> LoyaltyProgram:
    return get_object_or_404(
        LoyaltyProgram.objects.select_related("business", "catalog_item"),
        id=program_id,
        business=request.user.owned_business,
    )


class BusinessProgramListCreateView(APIView):
    permission_classes = [IsBusinessOwner]
    serializer_class = LoyaltyProgramWriteSerializer
    pagination_class = StandardResultsSetPagination

    def get(self, request):
        programs = LoyaltyProgramService.list_for_business(
            request.user.owned_business
        ).annotate(
            members_count=Count("memberships", distinct=True),
            outstanding_count=Count(
                "vouchers",
                filter=Q(vouchers__status=LoyaltyVoucher.Status.ACTIVE),
                distinct=True,
            ),
            redeemed_count=Count(
                "vouchers",
                filter=Q(vouchers__status=LoyaltyVoucher.Status.REDEEMED),
                distinct=True,
            ),
        )
        rows = []
        for program in programs:
            data = LoyaltyProgramSerializer(program, context={"request": request}).data
            data.update(
                members=program.members_count,
                outstanding=program.outstanding_count,
                redeemed=program.redeemed_count,
            )
            rows.append(data)
        return success_response({"results": rows})

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        item_id = values.pop("catalog_item_id", None)
        if item_id:
            values["catalog_item"] = get_object_or_404(
                CatalogItem, id=item_id, business=request.user.owned_business
            )
        program = LoyaltyProgramService.create(
            request.user.owned_business, request.user, **values
        )
        return success_response(
            LoyaltyProgramSerializer(program, context={"request": request}).data,
            status=201,
        )

    def get_throttles(self):
        return (
            [ScopedRateThrottle()]
            if self.request.method == "POST"
            else super().get_throttles()
        )

    throttle_scope = "loyalty_write"


class BusinessProgramDetailView(APIView):
    permission_classes = [IsBusinessOwner]
    serializer_class = LoyaltyProgramWriteSerializer

    def get(self, request, program_id):
        program = _owner_program(request, program_id)
        memberships = program.memberships.select_related("customer").order_by(
            "-joined_at"
        )
        transactions = (
            LoyaltyTransaction.objects.filter(program=program)
            .select_related("staff")
            .order_by("-created_at")[:100]
        )
        analytics = LoyaltyAnalyticsService.for_program(program)
        config = LoyaltyProgramSerializer(program, context={"request": request}).data
        members = [
            {
                "customer_name": row.customer.name or row.customer.phone or "Customer",
                "state": {
                    "stamps_count": row.stamps_count,
                    "visits_count": row.visits_count,
                    "points_balance": row.points_balance,
                },
                "joined_at": row.joined_at,
            }
            for row in memberships
        ]
        return success_response(
            {
                **config,
                "overview": analytics.__dict__,
                "members": members,
                "transactions": LoyaltyTransactionSerializer(
                    transactions, many=True
                ).data,
                "analytics": {
                    "stat_a": analytics.members,
                    "stat_b": analytics.outstanding,
                    "stat_c": analytics.redeemed,
                },
                "settings": config,
            }
        )

    def patch(self, request, program_id):
        program = _owner_program(request, program_id)
        serializer = self.serializer_class(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = dict(serializer.validated_data)
        item_id = values.pop("catalog_item_id", None)
        if item_id:
            values["catalog_item"] = get_object_or_404(
                CatalogItem, id=item_id, business=request.user.owned_business
            )
        program = LoyaltyProgramService.update(program, **values)
        return success_response(
            LoyaltyProgramSerializer(program, context={"request": request}).data
        )

    throttle_scope = "loyalty_write"

    def get_throttles(self):
        return (
            [ScopedRateThrottle()]
            if self.request.method == "PATCH"
            else super().get_throttles()
        )


class BusinessProgramActionView(_WriteThrottleMixin, APIView):
    permission_classes = [IsBusinessOwner]
    serializer_class = LoyaltyProgramSerializer
    action = "pause"

    def post(self, request, program_id):
        program = getattr(LoyaltyProgramService, self.action)(
            _owner_program(request, program_id)
        )
        return success_response(LoyaltyProgramSerializer(program).data)


class PauseProgramView(BusinessProgramActionView):
    action = "pause"


class ActivateProgramView(BusinessProgramActionView):
    action = "activate"


class ArchiveProgramView(BusinessProgramActionView):
    action = "archive"


class CustomerCardsView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = LoyaltyCardSerializer

    def get(self, request):
        cards = LoyaltyMembershipService.cards_for_customer(request.user)
        return success_response(
            {"results": LoyaltyCardSerializer(cards, many=True).data}
        )


class CustomerProgramView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = LoyaltyCardSerializer

    def get(self, request, program_id):
        program = get_object_or_404(
            LoyaltyProgram.objects.select_related("business"), id=program_id
        )
        card = LoyaltyMembershipService.card_view(program, request.user)
        history = (
            LoyaltyTransaction.objects.filter(program=program, customer=request.user)
            .select_related("staff")
            .order_by("-created_at")
        )
        return success_response(
            {
                **LoyaltyCardSerializer(card).data,
                "history": LoyaltyTransactionSerializer(history, many=True).data,
            }
        )


class CustomerJoinView(_WriteThrottleMixin, APIView):
    permission_classes = [IsCustomer]
    serializer_class = LoyaltyCardSerializer

    def post(self, request, program_id):
        program = get_object_or_404(
            LoyaltyProgram.objects.select_related("business"),
            id=program_id,
            status=LoyaltyProgram.Status.ACTIVE,
        )
        membership, _ = LoyaltyMembershipService.get_or_create_membership(
            program, request.user
        )
        return success_response(
            LoyaltyCardSerializer(
                LoyaltyMembershipService.card_view(program, request.user, membership)
            ).data
        )


class CustomerRedeemPointsView(_WriteThrottleMixin, APIView):
    permission_classes = [IsCustomer]
    serializer_class = RedeemPointsSerializer

    def post(self, request, program_id):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        program = get_object_or_404(
            LoyaltyProgram, id=program_id, status=LoyaltyProgram.Status.ACTIVE
        )
        voucher = LoyaltyRedemptionService.redeem_points(
            program, request.user, serializer.validated_data["points"]
        )
        return success_response(LoyaltyVoucherSerializer(voucher).data, status=201)


class CustomerCatalogView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = SelectItemSerializer
    pagination_class = StandardResultsSetPagination

    def get(self, request, program_id):
        program = get_object_or_404(LoyaltyProgram, id=program_id)
        items = CatalogItem.objects.filter(
            business=program.business, is_active=True
        ).values("id", "name", "price", "image")
        return success_response({"results": list(items)})


class CustomerVouchersView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = LoyaltyVoucherSerializer

    def get(self, request):
        vouchers = (
            LoyaltyVoucher.objects.filter(customer=request.user)
            .select_related("program", "business", "catalog_item", "qr_token")
            .order_by("expires_at")
        )
        now = timezone.now()
        LoyaltyVoucher.objects.filter(
            customer=request.user,
            status=LoyaltyVoucher.Status.ACTIVE,
            expires_at__lte=now,
        ).update(status=LoyaltyVoucher.Status.EXPIRED)
        groups = {"active": [], "used": [], "expired": []}
        for voucher in vouchers:
            key = (
                "active"
                if voucher.status == LoyaltyVoucher.Status.ACTIVE
                else "used"
                if voucher.status == LoyaltyVoucher.Status.REDEEMED
                else "expired"
            )
            groups[key].append(LoyaltyVoucherSerializer(voucher).data)
        return success_response(groups)


class CustomerSelectVoucherItemView(_WriteThrottleMixin, APIView):
    permission_classes = [IsCustomer]
    serializer_class = SelectItemSerializer

    def post(self, request, voucher_id):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        voucher = get_object_or_404(
            LoyaltyVoucher.objects.select_related("program"),
            id=voucher_id,
            customer=request.user,
        )
        item = get_object_or_404(
            CatalogItem, id=serializer.validated_data["catalog_item_id"]
        )
        return success_response(
            LoyaltyVoucherSerializer(
                LoyaltyRedemptionService.select_voucher_item(
                    voucher, item, request.user
                )
            ).data
        )


class CustomerBusinessLoyaltyView(APIView):
    permission_classes = [IsCustomer]
    serializer_class = LoyaltyCardSerializer

    def get(self, request, business_id):
        business = get_object_or_404(Business, id=business_id)
        rows = LoyaltyMembershipService.rows_for_business_customer(
            business, request.user
        )
        return success_response(
            {"results": LoyaltyCardSerializer(rows, many=True).data}
        )


class StaffAwardView(_WriteThrottleMixin, APIView):
    permission_classes = [IsStaff]
    serializer_class = AwardSerializer

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        token = resolve_qr_token(
            serializer.validated_data["token"], request, action="loyalty_award"
        )
        if token.customer is None:
            raise JaqynAPIException("INVALID_QR_TOKEN")
        program = get_object_or_404(
            LoyaltyProgram, id=serializer.validated_data["program_id"]
        )
        result = LoyaltyEarningService.award(
            program, token.customer, staff, serializer.validated_data.get("amount")
        )
        membership = result.membership
        return success_response(
            {
                "customer": token.customer.name or "Customer",
                "program_id": str(program.id),
                "name": program.name,
                "type": program.type,
                "points_balance": membership.points_balance,
                "stamps_count": membership.stamps_count,
                "visits_count": membership.visits_count,
                "required_count": program.required_count,
                "voucher": LoyaltyVoucherSerializer(result.voucher).data
                if result.voucher
                else None,
            }
        )


class StaffRedeemVoucherView(_WriteThrottleMixin, APIView):
    permission_classes = [IsStaff]
    serializer_class = RedeemVoucherSerializer

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        voucher = LoyaltyRedemptionService.redeem_voucher(
            serializer.validated_data["code"], get_staff_for_user(request.user)
        )
        return success_response(LoyaltyVoucherSerializer(voucher).data)
