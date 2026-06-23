import math

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.businesses.models import Business
from apps.businesses.serializers import (
    BusinessImageUploadSerializer,
    BusinessSerializer,
    PublicBusinessSerializer,
)
from apps.businesses.services import (
    register_business,
    set_business_cover,
    set_business_logo,
)
from apps.reporting.services import business_metrics
from core.exceptions import JaqynAPIException
from core.permissions import IsBusinessOwner, IsBusinessOwnerOrAdmin
from core.response import success_response


class PublicBusinessListView(APIView):
    """Customer discovery — approved/published businesses with search + optional geo filtering."""

    permission_classes = [AllowAny]

    def get(self, request):
        qs = (
            Business.objects.filter(
                status=Business.Status.APPROVED,
                visibility_status=Business.VisibilityStatus.PUBLISHED,
            )
            .prefetch_related("catalog_items", "reward_programs", "group_offers")
            .order_by("name")
        )

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(category__icontains=search)
                | Q(area__icontains=search)
                | Q(address__icontains=search)
                | Q(description__icontains=search)
            )

        category = request.query_params.get("category", "").strip()
        if category and category != "all":
            qs = qs.filter(category=category)

        area = request.query_params.get("area")
        if area:
            qs = qs.filter(area__icontains=area)

        businesses = list(qs)
        origin = _parse_origin(request)
        radius_km = _parse_float(request.query_params.get("radius_km"))
        if origin:
            businesses = _with_distances(businesses, origin)
            if radius_km is not None:
                businesses = [b for b in businesses if getattr(b, "distance_km", None) is not None and b.distance_km <= radius_km]
            businesses.sort(key=lambda b: (getattr(b, "distance_km", None) is None, getattr(b, "distance_km", 0), b.name.lower()))
        limit = _parse_int(request.query_params.get("limit"), default=8, minimum=1, maximum=20)
        businesses = businesses[:limit]

        return success_response({"results": PublicBusinessSerializer(businesses, many=True, context={"request": request}).data})


class PublicBusinessDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, business_id):
        business = get_object_or_404(
            Business.objects.prefetch_related("catalog_items", "reward_programs", "group_offers"),
            id=business_id,
            status=Business.Status.APPROVED,
            visibility_status=Business.VisibilityStatus.PUBLISHED,
        )
        origin = _parse_origin(request)
        if origin and business.latitude is not None and business.longitude is not None:
            business.distance_km = _distance_km(origin[0], origin[1], float(business.latitude), float(business.longitude))
        return success_response(PublicBusinessSerializer(business, context={"request": request}).data)


class BusinessRegisterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = BusinessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = register_business(request.user, serializer.validated_data)
        return success_response(BusinessSerializer(business).data, status=201)


class BusinessMeView(APIView):
    permission_classes = [IsBusinessOwnerOrAdmin]

    def get_business(self, request):
        try:
            return request.user.owned_business
        except Business.DoesNotExist:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)

    def get(self, request):
        return success_response(BusinessSerializer(self.get_business(request)).data)

    def patch(self, request):
        business = self.get_business(request)
        serializer = BusinessSerializer(business, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(BusinessSerializer(business).data)


class _BusinessImageUploadView(APIView):
    """Shared base for the owner brand-asset upload endpoints.

    Owner-only (``IsBusinessOwner``); the owner must already own a business.
    Views stay thin: validate the file with the serializer, hand it to the
    service (which compresses + saves), and return the owner profile via
    :class:`BusinessSerializer` (carries ``logo_url`` / ``cover_url``). The write
    is scoped-throttled. Subclasses set ``_save`` to the service function.
    """

    permission_classes = [IsBusinessOwner]
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = BusinessImageUploadSerializer
    throttle_scope = "business_image"

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def _business(self, request):
        try:
            return request.user.owned_business
        except Business.DoesNotExist:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)

    def post(self, request):
        business = self._business(request)
        serializer = BusinessImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._save(business, serializer.validated_data["image"])
        return success_response(BusinessSerializer(business).data)

    @staticmethod
    def _save(business, image):  # pragma: no cover - overridden by subclasses
        raise NotImplementedError


class BusinessLogoUploadView(_BusinessImageUploadView):
    """POST /api/business/profile/logo/ — compress + store the brand logo."""

    @staticmethod
    def _save(business, image):
        return set_business_logo(business, image)


class BusinessCoverUploadView(_BusinessImageUploadView):
    """POST /api/business/profile/cover/ — compress + store the cover image."""

    @staticmethod
    def _save(business, image):
        return set_business_cover(business, image)


class BusinessDashboardView(APIView):
    permission_classes = [IsBusinessOwnerOrAdmin]

    def get(self, request):
        try:
            business = request.user.owned_business
        except Business.DoesNotExist:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)

        metrics = business_metrics(business)
        return success_response({
            "business": BusinessSerializer(business).data,
            "metrics": {
                "scans": metrics["total_scans"],
                "customers": metrics["new_customers"] + metrics["returning_customers"],
                "rewards": metrics["rewards_issued"],
                **metrics,
            },
        })


def _parse_float(value):
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _parse_int(value, default=8, minimum=1, maximum=20):
    try:
        parsed = int(value) if value not in (None, "") else default
    except (TypeError, ValueError):
        parsed = default
    return min(maximum, max(minimum, parsed))


def _parse_origin(request):
    lat = _parse_float(request.query_params.get("lat"))
    lng = _parse_float(request.query_params.get("lng"))
    if lat is None or lng is None:
        return None
    return lat, lng


def _with_distances(businesses, origin):
    lat, lng = origin
    for business in businesses:
        if business.latitude is None or business.longitude is None:
            business.distance_km = None
            continue
        business.distance_km = _distance_km(lat, lng, float(business.latitude), float(business.longitude))
    return businesses


def _distance_km(lat1, lng1, lat2, lng2):
    radius = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))
