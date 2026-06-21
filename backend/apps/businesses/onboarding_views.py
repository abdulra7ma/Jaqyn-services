from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.accounts.serializers import UserSerializer
from apps.businesses import onboarding_services as obs
from apps.businesses.models import Business, BusinessType, CatalogItem, StaffInvite
from apps.businesses.serializers import (
    BusinessSerializer,
    BusinessTypeSerializer,
    CatalogItemSerializer,
    OwnerInviteActivateSerializer,
    StaffInviteSerializer,
)
from core.exceptions import JaqynAPIException
from core.permissions import IsBusinessOwner
from core.response import success_response


class OwnerBusinessMixin:
    """Resolve the authenticated owner's business or 404."""

    def get_business(self, request):
        business = Business.objects.filter(owner=request.user).first()
        if business is None:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)
        return business


# ---- business types catalog ----


class BusinessTypeListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        qs = BusinessType.objects.filter(is_active=True)
        return success_response({"results": BusinessTypeSerializer(qs, many=True).data})


# ---- owner invite activation ----


class OwnerInviteValidateView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get("token", "")
        invite = obs.validate_owner_token(token)
        return success_response(
            {
                "business_name": invite.business.name,
                "email": invite.email,
                "phone": invite.phone,
                "expires_at": invite.expires_at,
            }
        )


class OwnerInviteActivateView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OwnerInviteActivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, business, access, refresh = obs.activate_owner(
            serializer.validated_data["token"],
            serializer.validated_data["full_name"],
            serializer.validated_data["password"],
        )
        return success_response(
            {
                "access": access,
                "refresh": refresh,
                "user": UserSerializer(user).data,
                "business_id": str(business.id),
                "next_step": "business_info",
            }
        )


# ---- onboarding state ----


class OnboardingView(OwnerBusinessMixin, APIView):
    permission_classes = [IsBusinessOwner]

    def get(self, request):
        return success_response(obs.onboarding_state(self.get_business(request)))

    def patch(self, request):
        """Autosave step data — partial business profile fields."""
        business = self.get_business(request)
        serializer = BusinessSerializer(business, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        if business.onboarding_status == Business.OnboardingStatus.NOT_STARTED:
            business.onboarding_status = Business.OnboardingStatus.IN_PROGRESS
            business.save(update_fields=["onboarding_status", "updated_at"])
        return success_response(
            {"business": BusinessSerializer(business).data, **obs.onboarding_state(business)}
        )


class OnboardingSubmitView(OwnerBusinessMixin, APIView):
    permission_classes = [IsBusinessOwner]

    def post(self, request):
        business = obs.submit_onboarding(self.get_business(request))
        return success_response(obs.onboarding_state(business))


# ---- catalog items ----


class CatalogItemListCreateView(OwnerBusinessMixin, APIView):
    permission_classes = [IsBusinessOwner]

    def get(self, request):
        business = self.get_business(request)
        qs = business.catalog_items.filter(is_active=True)
        return success_response({"results": CatalogItemSerializer(qs, many=True).data})

    def post(self, request):
        business = self.get_business(request)
        serializer = CatalogItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(business=business)
        return success_response(serializer.data, status=201)


class CatalogItemDetailView(OwnerBusinessMixin, APIView):
    permission_classes = [IsBusinessOwner]

    def get_item(self, request, item_id):
        return get_object_or_404(CatalogItem, id=item_id, business=self.get_business(request))

    def patch(self, request, item_id):
        item = self.get_item(request, item_id)
        serializer = CatalogItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(serializer.data)

    def delete(self, request, item_id):
        self.get_item(request, item_id).delete()
        return success_response(message="Item removed")


# ---- staff invites ----


class StaffInviteListCreateView(OwnerBusinessMixin, APIView):
    permission_classes = [IsBusinessOwner]

    def get(self, request):
        business = self.get_business(request)
        qs = business.staff_invites.exclude(status=StaffInvite.Status.CANCELLED)
        return success_response(
            {"results": StaffInviteSerializer(qs, many=True).data, "limit": obs.STAFF_LIMIT, "used": obs.staff_invite_usage(business)}
        )

    def post(self, request):
        business = self.get_business(request)
        if not obs.can_add_staff(business):
            raise JaqynAPIException(
                "STAFF_LIMIT_REACHED", "Staff invitation limit reached", status_code=409
            )
        serializer = StaffInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(business=business)
        return success_response(serializer.data, status=201)


class StaffInviteDetailView(OwnerBusinessMixin, APIView):
    permission_classes = [IsBusinessOwner]

    def get_invite(self, request, invite_id):
        return get_object_or_404(StaffInvite, id=invite_id, business=self.get_business(request))

    def patch(self, request, invite_id):
        invite = self.get_invite(request, invite_id)
        serializer = StaffInviteSerializer(invite, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(serializer.data)

    def delete(self, request, invite_id):
        self.get_invite(request, invite_id).delete()
        return success_response(message="Invite removed")
