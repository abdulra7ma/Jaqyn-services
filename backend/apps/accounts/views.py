from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.serializers import (
    CustomerProfileSerializer,
    GoogleAuthSerializer,
    LoginResolveSerializer,
    PasswordLoginSerializer,
    ProfileUpdateSerializer,
    RequestEmailOTPSerializer,
    RequestOTPSerializer,
    RequestPasswordResetSerializer,
    ResetPasswordSerializer,
    UserSerializer,
    VerifyEmailOTPSerializer,
    VerifyOTPSerializer,
)
from apps.accounts.services import (
    authenticate_google,
    authenticate_identifier,
    issue_email_otp,
    issue_otp,
    issue_password_reset_otp,
    reset_password,
    resolve_area,
    resolve_areas,
    resolve_login_method,
    verify_email_otp,
    verify_otp,
)
from core.response import success_response


def _onboarding_done(user):
    profile = getattr(user, "customer_profile", None)
    return bool(profile and profile.onboarding_completed)


def _profile_done(user) -> bool:
    # Landing area decides which "profile complete" flag matters.
    if resolve_area(user) == "staff":
        membership = user.staff_memberships.filter(is_active=True).first()
        return bool(membership and membership.profile_completed)
    profile = getattr(user, "customer_profile", None)
    return bool(profile and profile.profile_completed)


def _auth_payload(user, access, refresh, **extra):
    return {
        "access": access,
        "refresh": refresh,
        "user": UserSerializer(user).data,
        "area": resolve_area(user),
        "areas": resolve_areas(user),
        "onboarding_completed": _onboarding_done(user),
        "profile_completed": _profile_done(user),
        **extra,
    }


def request_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class RequestOTPView(APIView):
    permission_classes = [AllowAny]
    # Scoped throttle replaces the anon/user defaults — deliberately stricter,
    # since every request costs an SMS. Same pattern on the auth views below.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_otp_request"

    def post(self, request):
        serializer = RequestOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request_id = issue_otp(serializer.validated_data["phone"], request_ip(request))
        from django.conf import settings

        return success_response({"request_id": request_id, "expires_in": settings.OTP_TTL_SECONDS})


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_otp_verify"

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, is_new, access, refresh = verify_otp(serializer.validated_data["phone"], serializer.validated_data["code"])
        return success_response(_auth_payload(user, access, refresh, is_new=is_new))


class RequestEmailOTPView(APIView):
    permission_classes = [AllowAny]  # Public signup endpoint — no token required
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_otp_request"

    def post(self, request):
        serializer = RequestEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from django.conf import settings

        request_id = issue_email_otp(
            serializer.validated_data["email"],
            request_ip(request),
            serializer.validated_data["language"],
        )
        return success_response({"request_id": request_id, "expires_in": settings.OTP_TTL_SECONDS})


class VerifyEmailOTPView(APIView):
    permission_classes = [AllowAny]  # Public signup endpoint — no token required
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_otp_verify"

    def post(self, request):
        serializer = VerifyEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, is_new, access, refresh = verify_email_otp(
            serializer.validated_data["email"],
            serializer.validated_data["code"],
        )
        return success_response(_auth_payload(user, access, refresh, is_new=is_new))


class GoogleAuthView(APIView):
    permission_classes = [AllowAny]  # Public — the verified ID token is the credential
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, is_new, access, refresh = authenticate_google(serializer.validated_data["id_token"])
        return success_response(_auth_payload(user, access, refresh, is_new=is_new))


class PasswordLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = PasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, access, refresh = authenticate_identifier(
            serializer.validated_data["identifier"], serializer.validated_data["password"]
        )
        return success_response(_auth_payload(user, access, refresh))


class RequestPasswordResetView(APIView):
    permission_classes = [AllowAny]  # Public — anyone can request a reset code
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_password_reset"

    def post(self, request):
        serializer = RequestPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        issue_password_reset_otp(
            serializer.validated_data["email"],
            request_ip(request),
            serializer.validated_data["language"],
        )
        # Always the same response — never reveal whether the account exists.
        return success_response({"message": "If the account exists, a reset code was sent."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]  # Public — completes reset with the emailed code
    # Verify-tier scope: completing a reset is a code-guessing surface, same as OTP verify.
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_otp_verify"

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user, access, refresh = reset_password(
            serializer.validated_data["email"],
            serializer.validated_data["code"],
            serializer.validated_data["new_password"],
        )
        return success_response(_auth_payload(user, access, refresh))


class LoginResolveView(APIView):
    permission_classes = [AllowAny]  # Public — determines auth method before credentials are sent
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_resolve"

    def post(self, request):
        serializer = LoginResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = resolve_login_method(serializer.validated_data["identifier"], request_ip(request))
        return success_response(result)


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
            "areas": resolve_areas(request.user),
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
                "profile_completed": membership.profile_completed,
            }
        return success_response(data)


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        serializer = ProfileUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data.get("phone"):
            from core.exceptions import JaqynAPIException

            taken = User.objects.filter(phone=data["phone"]).exclude(pk=request.user.pk).exists()
            if taken:
                raise JaqynAPIException("PHONE_TAKEN", "Phone already in use", status_code=409)

        for field in ("name", "email", "phone"):
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
            # Supplying a non-empty name satisfies the required-info completion gate.
            if data.get("name"):
                profile.profile_completed = True
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
        from core.exceptions import JaqynAPIException
        from core.images import AVATAR_MAX_DIM, compress_image
        from core.validators import MAX_IMAGE_UPLOAD_BYTES

        # Reject oversized files before the compressor sees them — avatars render
        # at small sizes so 5 MB is well above any reasonable input (see the
        # why-comment on MAX_IMAGE_UPLOAD_BYTES in core/validators.py).
        if avatar_file.size > MAX_IMAGE_UPLOAD_BYTES:
            mb = MAX_IMAGE_UPLOAD_BYTES // (1024 * 1024)
            raise JaqynAPIException(
                code="FILE_TOO_LARGE",
                message=f"Image file too large. Maximum allowed size is {mb} MB.",
                status_code=400,
            )
        # Compress before storing — avatars render small, so bound them tightly.
        request.user.avatar = compress_image(avatar_file, max_dim=AVATAR_MAX_DIM)
        request.user.avatar_emoji = ""
        request.user.save()
        return success_response({"user": UserSerializer(request.user).data})
