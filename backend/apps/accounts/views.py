from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.serializers import (
    CustomerProfileSerializer,
    PasswordLoginSerializer,
    ProfileUpdateSerializer,
    RequestOTPSerializer,
    UserSerializer,
    VerifyOTPSerializer,
)
from apps.accounts.services import authenticate_password, issue_otp, resolve_area, verify_otp
from core.response import success_response


def _onboarding_done(user):
    profile = getattr(user, "customer_profile", None)
    return bool(profile and profile.onboarding_completed)


def _auth_payload(user, access, refresh, **extra):
    return {
        "access": access,
        "refresh": refresh,
        "user": UserSerializer(user).data,
        "area": resolve_area(user),
        "onboarding_completed": _onboarding_done(user),
        **extra,
    }


def request_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class RequestOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = issue_otp(serializer.validated_data["phone"], request_ip(request))
        from django.conf import settings

        return success_response({"request_id": request_id, "expires_in": settings.OTP_TTL_SECONDS})


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, is_new, access, refresh = verify_otp(serializer.validated_data["phone"], serializer.validated_data["code"])
        return success_response(_auth_payload(user, access, refresh, is_new=is_new))


class PasswordLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, access, refresh = authenticate_password(
            serializer.validated_data["email"], serializer.validated_data["password"]
        )
        return success_response(_auth_payload(user, access, refresh))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = RefreshToken(request.data.get("refresh"))
        token.blacklist()
        return success_response()


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.system.models import SystemConfiguration

        data = {
            "user": UserSerializer(request.user).data,
            "area": resolve_area(request.user),
            "limits": {"max_active_groups": SystemConfiguration.load().max_active_groups_per_user},
        }
        if hasattr(request.user, "customer_profile"):
            data["profile"] = CustomerProfileSerializer(request.user.customer_profile).data
        if hasattr(request.user, "owned_business"):
            business = request.user.owned_business
            data["business"] = {"id": str(business.id), "name": business.name, "status": business.status}
        membership = (
            request.user.staff_memberships.filter(is_active=True).select_related("business").first()
        )
        if membership:
            data["staff"] = {
                "id": str(membership.id),
                "name": membership.name,
                "role": membership.role,
                "business_id": str(membership.business_id),
                "business_name": membership.business.name,
            }
        return success_response(data)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        serializer = ProfileUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        for field in ("name", "email"):
            if field in data:
                setattr(request.user, field, data[field])
        if "avatar_emoji" in data:
            request.user.avatar_emoji = data["avatar_emoji"]
            if data["avatar_emoji"]:
                # Emoji takes over — clear any uploaded photo
                request.user.avatar = None
        request.user.save()

        profile = getattr(request.user, "customer_profile", None)
        if request.user.role == "customer" and profile is None:
            from apps.accounts.models import CustomerProfile

            profile = CustomerProfile.objects.create(user=request.user)
        if profile is not None:
            for field in ("birthday", "language", "marketing_opt_in", "onboarding_completed"):
                if field in data:
                    setattr(profile, field, data[field])
            profile.save()

        payload = {"user": UserSerializer(request.user).data}
        if profile is not None:
            payload["profile"] = CustomerProfileSerializer(profile).data
        return success_response(payload)


class AvatarUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        avatar_file = request.FILES.get("avatar")
        if not avatar_file:
            from core.exceptions import JaqynAPIException

            raise JaqynAPIException(code="AVATAR_REQUIRED", message="avatar file is required", status_code=400)
        request.user.avatar = avatar_file
        request.user.avatar_emoji = ""
        request.user.save()
        return success_response({"user": UserSerializer(request.user).data})
