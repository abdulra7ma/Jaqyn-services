from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from apps.businesses import onboarding_services as obs
from apps.businesses.models import Business
from apps.businesses.serializers import (
    BusinessAdminActionSerializer,
    BusinessSerializer,
    RequestChangesSerializer,
    VerifyActionSerializer,
)
from apps.businesses.services import approve_business, reject_business
from apps.reporting.services import disable_business_and_tokens
from core.permissions import IsAdmin
from core.response import success_response


class PendingBusinessesView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        businesses = Business.objects.filter(status=Business.Status.PENDING).order_by("created_at")
        return success_response({"results": BusinessSerializer(businesses, many=True).data})


class ApproveBusinessView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, business_id):
        business = approve_business(get_object_or_404(Business, id=business_id), request.user)
        return success_response(BusinessSerializer(business).data)


class RejectBusinessView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, business_id):
        serializer = BusinessAdminActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = reject_business(get_object_or_404(Business, id=business_id), request.user, serializer.validated_data.get("reason"))
        return success_response(BusinessSerializer(business).data)


class DisableBusinessView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, business_id):
        serializer = BusinessAdminActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = disable_business_and_tokens(get_object_or_404(Business, id=business_id), request.user, serializer.validated_data.get("reason"))
        return success_response(BusinessSerializer(business).data)


class VerificationQueueView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        businesses = Business.objects.filter(
            onboarding_status=Business.OnboardingStatus.SUBMITTED
        ).order_by("submitted_at")
        return success_response({"results": BusinessSerializer(businesses, many=True).data})


class VerifyBusinessView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, business_id):
        serializer = VerifyActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = obs.verify_business(
            get_object_or_404(Business, id=business_id), publish=serializer.validated_data["publish"]
        )
        return success_response(BusinessSerializer(business).data)


class RequestChangesView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, business_id):
        serializer = RequestChangesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = obs.request_changes(
            get_object_or_404(Business, id=business_id), serializer.validated_data.get("note", "")
        )
        return success_response(BusinessSerializer(business).data)
