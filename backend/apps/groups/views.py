from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.groups.models import GroupDeal, GroupMember, GroupOffer
from apps.groups.serializers import (
    BusinessGroupDealSerializer,
    CheckInSerializer,
    CreateGroupDealSerializer,
    GroupDealSerializer,
    GroupOfferSerializer,
)
from apps.groups.services import (
    activate_group_offer,
    active_public_offers,
    approve_group_offer,
    cancel_group_deal,
    check_in_group_member,
    create_group_deal,
    create_group_offer,
    join_group_deal,
    leave_group_deal,
    pause_group_offer,
    redeem_group_reward,
    reject_group_offer,
    submit_group_offer,
)
from apps.loyalty.services import get_staff_for_user
from core.exceptions import JaqynAPIException
from core.permissions import IsAdmin, IsBusinessOwner, IsCustomer, IsStaff
from core.response import success_response


class PublicGroupOfferListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return success_response({"results": GroupOfferSerializer(active_public_offers(), many=True).data})


class PublicGroupOfferDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, offer_id):
        offer = get_object_or_404(active_public_offers(), id=offer_id)
        return success_response(GroupOfferSerializer(offer).data)


class BusinessGroupOfferListCreateView(APIView):
    permission_classes = [IsBusinessOwner]

    def get(self, request):
        offers = GroupOffer.objects.filter(business=request.user.owned_business).order_by("-created_at")
        return success_response({"results": GroupOfferSerializer(offers, many=True).data})

    def post(self, request):
        serializer = GroupOfferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        offer = create_group_offer(request.user.owned_business, serializer.validated_data)
        return success_response(GroupOfferSerializer(offer).data, status=201)


class BusinessGroupDealListView(APIView):
    """Active groups today — live group deals across the owner's offers."""

    permission_classes = [IsBusinessOwner]

    def get(self, request):
        deals = (
            GroupDeal.objects.filter(group_offer__business=request.user.owned_business)
            .exclude(status__in=[GroupDeal.Status.CANCELLED, GroupDeal.Status.EXPIRED, GroupDeal.Status.FAILED])
            .select_related("leader", "group_offer")
            .order_by("visit_time")
        )
        return success_response({"results": BusinessGroupDealSerializer(deals, many=True).data})


class BusinessGroupOfferDetailView(APIView):
    permission_classes = [IsBusinessOwner]

    def get_offer(self, request, offer_id):
        return get_object_or_404(GroupOffer, id=offer_id, business=request.user.owned_business)

    def patch(self, request, offer_id):
        offer = self.get_offer(request, offer_id)
        serializer = GroupOfferSerializer(offer, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(GroupOfferSerializer(offer).data)

    def delete(self, request, offer_id):
        offer = self.get_offer(request, offer_id)
        # GroupDeal has a PROTECT FK — an offer with formed groups can't be hard-deleted.
        if offer.deals.exists():
            raise JaqynAPIException(
                "OFFER_HAS_GROUPS", "Cannot delete an offer that already has groups", status_code=409
            )
        offer.delete()
        return success_response(message="Offer deleted")


class SubmitGroupOfferView(BusinessGroupOfferDetailView):
    def post(self, request, offer_id):
        return success_response(GroupOfferSerializer(submit_group_offer(self.get_offer(request, offer_id))).data)


class PauseGroupOfferView(BusinessGroupOfferDetailView):
    def post(self, request, offer_id):
        return success_response(GroupOfferSerializer(pause_group_offer(self.get_offer(request, offer_id))).data)


class ActivateGroupOfferView(BusinessGroupOfferDetailView):
    def post(self, request, offer_id):
        return success_response(GroupOfferSerializer(activate_group_offer(self.get_offer(request, offer_id))).data)


class PendingGroupOffersView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        offers = GroupOffer.objects.filter(status=GroupOffer.Status.PENDING_APPROVAL).order_by("created_at")
        return success_response({"results": GroupOfferSerializer(offers, many=True).data})


class AdminApproveGroupOfferView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, offer_id):
        offer = approve_group_offer(get_object_or_404(GroupOffer, id=offer_id), request.user)
        return success_response(GroupOfferSerializer(offer).data)


class AdminRejectGroupOfferView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, offer_id):
        offer = reject_group_offer(get_object_or_404(GroupOffer, id=offer_id), request.user)
        return success_response(GroupOfferSerializer(offer).data)


class AdminPauseGroupOfferView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, offer_id):
        offer = pause_group_offer(get_object_or_404(GroupOffer, id=offer_id))
        return success_response(GroupOfferSerializer(offer).data)


class GroupCreateView(APIView):
    permission_classes = [IsCustomer]

    def post(self, request):
        serializer = CreateGroupDealSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        offer = get_object_or_404(GroupOffer, id=serializer.validated_data["group_offer"])
        deal = create_group_deal(request.user, offer, serializer.validated_data["visit_time"])
        return success_response(GroupDealSerializer(deal).data, status=201)


class GroupInviteView(APIView):
    permission_classes = []

    def get(self, request, invite_token):
        deal = get_object_or_404(GroupDeal.objects.select_related("group_offer", "leader").prefetch_related("members"), invite_token=invite_token)
        return success_response(GroupDealSerializer(deal).data)


class GroupJoinView(APIView):
    permission_classes = [IsCustomer]

    def post(self, request, group_id):
        deal = get_object_or_404(GroupDeal, id=group_id)
        return success_response(GroupDealSerializer(join_group_deal(request.user, deal)).data)


class GroupLeaveView(APIView):
    permission_classes = [IsCustomer]

    def post(self, request, group_id):
        deal = get_object_or_404(GroupDeal, id=group_id)
        return success_response(GroupDealSerializer(leave_group_deal(request.user, deal)).data)


class GroupCancelView(APIView):
    permission_classes = [IsCustomer]

    def post(self, request, group_id):
        deal = get_object_or_404(GroupDeal, id=group_id)
        return success_response(GroupDealSerializer(cancel_group_deal(request.user, deal)).data)


class GroupCheckInView(APIView):
    permission_classes = [IsCustomer]

    def post(self, request, group_id):
        serializer = CheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        deal = get_object_or_404(GroupDeal, id=group_id)
        return success_response(GroupDealSerializer(check_in_group_member(request.user, deal, serializer.validated_data.get("approval_code"), request)).data)


class CustomerGroupsView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        deals = GroupDeal.objects.filter(
            members__customer=request.user,
            members__status__in=[GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN],
        ).select_related("group_offer").prefetch_related("members").order_by("-created_at")
        return success_response({"results": GroupDealSerializer(deals, many=True).data})


class StaffGroupsView(APIView):
    permission_classes = [IsStaff]

    def get(self, request):
        staff = get_staff_for_user(request.user)
        deals = GroupDeal.objects.filter(group_offer__business=staff.business).select_related("group_offer").prefetch_related("members").order_by("-visit_time")
        return success_response({"results": GroupDealSerializer(deals, many=True).data})


class StaffGroupVerifyView(APIView):
    permission_classes = [IsStaff]

    def post(self, request, group_id):
        staff = get_staff_for_user(request.user)
        deal = get_object_or_404(GroupDeal, id=group_id)
        if deal.group_offer.business_id != staff.business_id:
            raise JaqynAPIException("WRONG_BUSINESS", status_code=403)
        return success_response(GroupDealSerializer(deal).data)


class StaffGroupRedeemView(APIView):
    permission_classes = [IsStaff]

    def post(self, request, group_id):
        staff = get_staff_for_user(request.user)
        deal = get_object_or_404(GroupDeal, id=group_id)
        return success_response(GroupDealSerializer(redeem_group_reward(staff, deal)).data)
