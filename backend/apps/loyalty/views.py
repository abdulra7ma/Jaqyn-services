from datetime import timedelta

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.businesses.models import Business
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption
from apps.loyalty.serializers import CollectSerializer, CustomerRewardProgressSerializer, RewardProgramSerializer, RewardRedemptionSerializer, StaffRedeemSerializer, WalletSerializer
from apps.loyalty.services import business_reward_card, collect_from_qr, create_reward_program, customer_wallet, ensure_pending_redemption, get_staff_for_user, present_redemption, redeem_reward
from core.exceptions import JaqynAPIException
from core.permissions import IsBusinessOwner, IsCustomer
from core.response import success_response


class BusinessRewardListCreateView(APIView):
    permission_classes = [IsBusinessOwner]

    def get(self, request):
        programs = RewardProgram.objects.filter(business=request.user.owned_business).order_by("-created_at")
        return success_response({"results": RewardProgramSerializer(programs, many=True).data})

    def post(self, request):
        serializer = RewardProgramSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        program = create_reward_program(request.user.owned_business, serializer.validated_data)
        return success_response(RewardProgramSerializer(program).data, status=201)


class BusinessRewardDetailView(APIView):
    permission_classes = [IsBusinessOwner]

    def get_program(self, request, reward_id):
        return get_object_or_404(RewardProgram, id=reward_id, business=request.user.owned_business)

    def get(self, request, reward_id):
        return success_response(RewardProgramSerializer(self.get_program(request, reward_id)).data)

    def patch(self, request, reward_id):
        program = self.get_program(request, reward_id)
        serializer = RewardProgramSerializer(program, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(RewardProgramSerializer(program).data)


class RewardPauseView(APIView):
    permission_classes = [IsBusinessOwner]

    def post(self, request, reward_id):
        program = get_object_or_404(RewardProgram, id=reward_id, business=request.user.owned_business)
        program.is_active = False
        program.save(update_fields=["is_active", "updated_at"])
        return success_response(RewardProgramSerializer(program).data)


class RewardActivateView(APIView):
    permission_classes = [IsBusinessOwner]

    def post(self, request, reward_id):
        if request.user.owned_business.status != Business.Status.APPROVED:
            raise JaqynAPIException("BUSINESS_NOT_ACTIVE", status_code=400)
        program = get_object_or_404(RewardProgram, id=reward_id, business=request.user.owned_business)
        program.is_active = True
        program.save(update_fields=["is_active", "updated_at"])
        return success_response(RewardProgramSerializer(program).data)


class CustomerRewardsView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        progress = CustomerRewardProgress.objects.filter(customer=request.user).select_related("business", "reward_program").order_by("-updated_at")
        return success_response({"results": CustomerRewardProgressSerializer(progress, many=True).data})


class CustomerRewardDetailView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, progress_id):
        progress = get_object_or_404(CustomerRewardProgress, id=progress_id, customer=request.user)
        return success_response(CustomerRewardProgressSerializer(progress).data)


class GenerateRedemptionCodeView(APIView):
    permission_classes = [IsCustomer]

    def post(self, request, progress_id):
        progress = get_object_or_404(CustomerRewardProgress, id=progress_id, customer=request.user)
        redemption = ensure_pending_redemption(progress)
        return success_response(RewardRedemptionSerializer(redemption).data)


class CollectFromQRView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        if request.user.role != "customer":
            raise JaqynAPIException("PERMISSION_DENIED", status_code=403)
        serializer = CollectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        progress = collect_from_qr(
            token,
            request.user,
            serializer.validated_data["approval_code"],
            request,
            serializer.validated_data.get("reward_program"),
        )
        return success_response(CustomerRewardProgressSerializer(progress).data)


class StaffRedeemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != "staff":
            raise JaqynAPIException("PERMISSION_DENIED", status_code=403)
        serializer = StaffRedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        staff = get_staff_for_user(request.user)
        redemption = redeem_reward(staff, code=serializer.validated_data.get("code"), token=serializer.validated_data.get("token"), request=request)
        return success_response(RewardRedemptionSerializer(redemption).data)


class StaffManualCodeRedeemView(StaffRedeemView):
    pass


class QRRedeemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        if request.user.role != "staff":
            raise JaqynAPIException("PERMISSION_DENIED", status_code=403)
        staff = get_staff_for_user(request.user)
        redemption = redeem_reward(staff, token=token, request=request)
        return success_response(RewardRedemptionSerializer(redemption).data)


class CustomerWalletView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request):
        wallet = customer_wallet(request.user)
        return success_response(wallet)


class CustomerPresentRedemptionView(APIView):
    permission_classes = [IsCustomer]

    def post(self, request, redemption_id):
        redemption = present_redemption(request.user, redemption_id)
        data = RewardRedemptionSerializer(redemption).data
        data["business_name"] = redemption.business.name
        data["reward_description"] = redemption.reward_program.reward_description
        ttl = getattr(settings, "REWARD_PRESENT_TTL_SECONDS", 120)
        data["present_expires_at"] = (timezone.now() + timedelta(seconds=ttl)).isoformat()
        return success_response(data)


class CustomerBusinessRewardCardView(APIView):
    permission_classes = [IsCustomer]

    def get(self, request, business_id):
        card = business_reward_card(request.user, business_id)
        return success_response(card)
