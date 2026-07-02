"""Public (unauthenticated) endpoints for the prospect pitch link.

Views parse input via serializers and delegate all logic to pitch_services;
they hold no business rules (see backend.md). AllowAny is deliberate — a prospect
has no account yet. Every endpoint is scoped-throttled ("pitch").
"""
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.businesses import pitch_services as ps
from core.response import success_response


def _client_ip(request: Request) -> str | None:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class ClaimSerializer(serializers.Serializer):
    email = serializers.EmailField()


class VerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)
    goal = serializers.IntegerField(min_value=1, max_value=99)
    reward_text = serializers.CharField(max_length=120)


class PitchResolveView(APIView):
    permission_classes = [AllowAny]  # prospect has no account yet
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pitch"

    def get(self, request: Request, token: str) -> Response:
        _, view = ps.resolve_pitch(token)
        # logo_path is a relative URL from storage (.url); make it absolute.
        logo_url = request.build_absolute_uri(view.logo_path) if view.logo_path else None
        return success_response({
            "business_id": view.business_id,
            "business_name": view.business_name,
            "logo_url": logo_url,
            "category": view.category,
            "default_goal": view.default_goal,
            "default_reward": view.default_reward,
            "published_count": view.published_count,
        })


class PitchClaimView(APIView):
    permission_classes = [AllowAny]  # prospect has no account yet
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pitch"

    def post(self, request: Request, token: str) -> Response:
        s = ClaimSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ps.request_pitch_code(token, s.validated_data["email"], _client_ip(request))
        return success_response({"sent": True})


class PitchVerifyView(APIView):
    permission_classes = [AllowAny]  # prospect has no account yet
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "pitch"

    def post(self, request: Request, token: str) -> Response:
        s = VerifySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        result = ps.claim_pitch(
            token,
            s.validated_data["email"],
            s.validated_data["code"],
            s.validated_data["goal"],
            s.validated_data["reward_text"],
        )
        return success_response({
            "access": result.access,
            "refresh": result.refresh,
            "user": {"id": str(result.user.id), "role": result.user.role},
        })
