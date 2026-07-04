from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.businesses.models import Business
from apps.qr.models import QRCodeToken
from apps.qr.serializers import ApprovalCodeInputSerializer
from apps.qr.services import (
    current_approval_code,
    generate_approval_code,
    get_or_create_customer_profile_token,
    get_or_create_merchant_collect_token,
    resolve_qr_token,
    validate_approval_code,
)
from core.exceptions import JaqynAPIException
from core.frontend import frontend_base_url
from core.permissions import IsBusinessOwner, IsCustomer, IsStaff
from core.qr import render_png_data_url
from core.response import success_response


class BusinessQRView(APIView):
    permission_classes = [IsBusinessOwner]

    def get(self, request):
        business = request.user.owned_business
        if business.status != Business.Status.APPROVED:
            raise JaqynAPIException("BUSINESS_NOT_ACTIVE", status_code=400)
        token = get_or_create_merchant_collect_token(business)
        url = f"{frontend_base_url(request)}/q/{token.token}"
        from core.logging import emit_event

        emit_event("merchant_qr_downloaded", business_id=str(business.id))
        return success_response({"token": token.token, "type": token.type, "url": url, "png": render_png_data_url(url)})


class CustomerProfileQRView(APIView):
    """The customer's personal QR — staff scan it to identify them."""

    permission_classes = [IsCustomer]

    def get(self, request):
        token = get_or_create_customer_profile_token(request.user)
        url = f"{frontend_base_url(request)}/q/{token.token}"
        return success_response(
            {"token": token.token, "type": token.type, "url": url, "png": render_png_data_url(url)}
        )


class QRResolveView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        qr_token = resolve_qr_token(token, request)
        active_reward = None
        if qr_token.business:
            # The first-scan card surfaces a business's most recent ACTIVE
            # campaign (loyalty programs are now INDIVIDUAL campaigns post
            # restructure). Imported locally to avoid a module-level qr→campaigns
            # import cycle.
            from apps.campaigns.models import Campaign

            campaign = (
                Campaign.objects.filter(
                    business=qr_token.business, status=Campaign.Status.ACTIVE
                )
                .select_related("rule", "reward")
                .order_by("-created_at")
                .first()
            )
            if campaign:
                rule = getattr(campaign, "rule", None)
                reward = getattr(campaign, "reward", None)
                # Pill label is the loyalty *mechanic* the customer collects by
                # (e.g. "visit"), not the campaign category. INDIVIDUAL campaigns
                # carry a rule.mechanic; GROUP/SOCIAL have none, so fall back to
                # the campaign type (the frontend keys qr.loyalty.<type> for all).
                mechanic = getattr(rule, "mechanic", None) if rule is not None else None
                active_reward = {
                    "id": str(campaign.id),
                    "type": mechanic or campaign.campaign_type,
                    "title": campaign.name,
                    "required_count": rule.required_count if rule is not None else None,
                    "reward_description": reward.description if reward is not None else "",
                }
        return success_response({
            "type": qr_token.type,
            "business": {
                "id": str(qr_token.business.id),
                "name": qr_token.business.name,
                "status": qr_token.business.status,
                # Relative /media/... url (via MEDIA_URL) so it passes through the
                # frontend proxy; None when no logo is set. Lets the first-scan
                # card show the real business icon, not just its initial.
                "logo_url": qr_token.business.logo.url if qr_token.business.logo else None,
            } if qr_token.business else None,
            "context": {"active_reward": active_reward},
        })


class StaffTodayCodeView(APIView):
    permission_classes = [IsStaff]

    def get(self, request):
        staff = request.user.staff_memberships.select_related("business").get(is_active=True)
        code = current_approval_code(staff.business)
        return success_response({"code": code.code, "valid_from": code.valid_from, "valid_to": code.valid_to})


class RegenerateApprovalCodeView(APIView):
    permission_classes = [IsBusinessOwner]

    def post(self, request):
        code = generate_approval_code(request.user.owned_business)
        return success_response({"code": code.code, "valid_from": code.valid_from, "valid_to": code.valid_to})


class ValidateApprovalCodeView(APIView):
    permission_classes = [IsCustomer]

    def post(self, request, business_id):
        serializer = ApprovalCodeInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = Business.objects.get(id=business_id)
        validate_approval_code(business, serializer.validated_data["code"], request.user, request)
        return success_response({"valid": True})
