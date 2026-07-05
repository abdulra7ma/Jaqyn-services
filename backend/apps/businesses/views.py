import math

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.businesses.models import Business, CatalogItem
from apps.businesses.serializers import (
    BusinessCategorySerializer,
    BusinessImageSerializer,
    BusinessImageUploadSerializer,
    BusinessLeadSerializer,
    BusinessSerializer,
    CatalogItemSerializer,
    DashboardActivityEventSerializer,
    GalleryUploadSerializer,
    OwnerStaffToggleSerializer,
    PublicBusinessSerializer,
)
from apps.businesses.discovery import active_category_payload, public_business_payload
from apps.businesses.services import (
    BusinessLeadData,
    add_gallery_image,
    register_business,
    register_business_lead,
    remove_gallery_image,
    set_business_cover,
    set_business_logo,
    set_catalog_item_image,
)
from apps.staff.services.management import ensure_owner_staff
from apps.staff.services import list_activity_events
from apps.reporting.services import business_metrics
from core.exceptions import JaqynAPIException
from core.permissions import IsBusinessOwner, IsBusinessOwnerOrAdmin
from core.response import success_response


class PublicBusinessListView(APIView):
    """Customer discovery — approved/published businesses with search + optional geo filtering."""

    permission_classes = [AllowAny]

    def get(self, request):
        # The DB-bound query + serialization is cached (origin-independent); only
        # distance/sort/limit happen per request. See apps.businesses.discovery.
        search = request.query_params.get("search", "").strip()
        category = request.query_params.get("category", "").strip()
        area = (request.query_params.get("area") or "").strip()
        items = public_business_payload(search=search, category=category, area=area)

        origin = _parse_origin(request)
        radius_km = _parse_float(request.query_params.get("radius_km"))
        if origin:
            lat, lng = origin
            for item in items:
                item["distance_km"] = _distance_from_serialized(item, lat, lng)
            if radius_km is not None:
                items = [it for it in items if it["distance_km"] is not None and it["distance_km"] <= radius_km]
            items.sort(key=lambda it: (it["distance_km"] is None, it["distance_km"] or 0, (it.get("name") or "").lower()))
        limit = _parse_int(request.query_params.get("limit"), default=8, minimum=1, maximum=20)
        items = items[:limit]

        return success_response({"results": items})


class PublicBusinessCategoriesView(APIView):
    """Customer discovery filter options — only ``Business.Category`` values that have
    at least one discoverable (approved + published) business.

    The model is the single source of truth; clients render their category chips from this
    response instead of hardcoding the list. Filtering to *active* categories means a chip
    is never shown that would return an empty list. (Cached; see discovery.py.)
    """

    permission_classes = [AllowAny]

    def get(self, request):
        categories = active_category_payload()
        return success_response({"results": BusinessCategorySerializer(categories, many=True).data})


class PublicBusinessDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, business_id):
        business = get_object_or_404(
            Business.objects.prefetch_related(
                "catalog_items", "campaigns__rule", "campaigns__reward", "gallery_images"
            ),
            id=business_id,
            status=Business.Status.APPROVED,
            visibility_status=Business.VisibilityStatus.PUBLISHED,
        )
        origin = _parse_origin(request)
        if origin and business.latitude is not None and business.longitude is not None:
            business.distance_km = _distance_km(origin[0], origin[1], float(business.latitude), float(business.longitude))
        return success_response(PublicBusinessSerializer(business, context={"request": request}).data)


class BusinessLeadCreateView(APIView):
    """POST /api/businesses/register-lead/ — accept a public landing-page lead.

    Public: the landing page is unauthenticated. Throttled via ScopedRateThrottle
    so the open endpoint cannot be hammered into spam (10 submissions/min per IP).
    Creates a PENDING, owner-less Business carrying the prospective owner's
    name + email for admin review. Returns the new business id (UUID).
    """

    # Public endpoint: the visitor hasn't created an account yet.
    # Throttled (see DEFAULT_THROTTLE_RATES "business_lead") to prevent spam.
    permission_classes = [AllowAny]
    throttle_scope = "business_lead"
    serializer_class = BusinessLeadSerializer

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def post(self, request):
        serializer = BusinessLeadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        lead_data = BusinessLeadData(
            name=d["name"],
            owner_name=d["owner_name"],
            email=d["email"],
            phone=d["phone"],
            category=d.get("category", ""),
            area=d.get("area", ""),
            instagram_url=d.get("instagram_url", ""),
        )
        business = register_business_lead(lead_data)
        return success_response({"id": str(business.id)}, status=201)


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


class OwnerStaffToggleView(APIView):
    """Enable/disable the owner's own staff seat ("work as staff").

    Owner-only. Enabling creates (or reactivates) the owner's MANAGER StaffMember
    so they can switch into the staff interface; disabling deactivates it. Returns
    the refreshed owner profile so the client sees the new ``owner_is_staff``.
    """

    permission_classes = [IsBusinessOwner]
    serializer_class = OwnerStaffToggleSerializer

    def get_business(self, request):
        try:
            return request.user.owned_business
        except Business.DoesNotExist:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        business = self.get_business(request)
        ensure_owner_staff(business, active=serializer.validated_data["enabled"])
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


# Owner dashboard shows only today's events, newest first, capped short — it's a
# glance widget, not the full staff history feed. The staff activity service caps
# each source at its newest 500 rows and today's events are by definition the
# newest, so filtering to today after that cap never drops one; the query count
# stays flat (one capped query per source).
_DASHBOARD_ACTIVITY_LIMIT = 10


class BusinessDashboardView(APIView):
    """GET /api/business/dashboard/ — owner's headline metrics + today's activity feed.

    Returns ``business`` (profile), ``metrics`` (reporting counters), and
    ``activity`` — today's events from the shared staff activity service
    (:func:`apps.staff.services.list_activity_events`), scoped to the owner's
    business, newest first and capped at :data:`_DASHBOARD_ACTIVITY_LIMIT`. Each
    event carries a masked customer label, kind, data label, and timestamp. The
    feed is empty for a business with no activity today.
    """

    permission_classes = [IsBusinessOwnerOrAdmin]

    def get(self, request):
        try:
            business = request.user.owned_business
        except Business.DoesNotExist:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)

        metrics = business_metrics(business)
        # "Today" = local calendar date, matching get_staff_today_stats' boundary.
        # created_at is tz-aware; convert to local time before comparing the date.
        today = timezone.localdate()
        activity = [
            event
            for event in list_activity_events(business)
            if timezone.localtime(event.created_at).date() == today
        ][:_DASHBOARD_ACTIVITY_LIMIT]
        return success_response({
            "business": BusinessSerializer(business).data,
            "metrics": {
                "scans": metrics["total_scans"],
                "customers": metrics["new_customers"] + metrics["returning_customers"],
                "rewards": metrics["rewards_issued"],
                **metrics,
            },
            "activity": DashboardActivityEventSerializer(activity, many=True).data,
        })


class CatalogItemImageUploadView(APIView):
    """POST /api/business/catalog-items/<id>/image/ — attach a compressed photo to a catalog item.

    Owner-only (``IsBusinessOwner``). The item must belong to the authenticated owner's
    business; a foreign item_id yields 404. Validates the file via ``GalleryUploadSerializer``
    (same shape as other image uploads), compresses to PRODUCT_MAX_DIM, then returns the
    updated CatalogItem (carrying ``image_url``) in the success envelope.
    """

    permission_classes = [IsBusinessOwner]
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "business_image"

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def post(self, request, item_id):
        try:
            business = request.user.owned_business
        except Business.DoesNotExist:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)

        item = get_object_or_404(CatalogItem, id=item_id, business=business)
        serializer = GalleryUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated = set_catalog_item_image(item, serializer.validated_data["image"])
        return success_response(CatalogItemSerializer(updated).data)


class GalleryListCreateView(APIView):
    """GET/POST /api/business/gallery/ — list or add business gallery images.

    Owner-only (``IsBusinessOwner``).
    GET returns ``{ results: GalleryImage[] }`` in sort_order order.
    POST accepts a multipart ``image`` file, enforces the 8-image cap (raises
    ``GALLERY_LIMIT_REACHED`` 409 when full), compresses to GALLERY_MAX_DIM, and
    returns the created GalleryImage.
    """

    permission_classes = [IsBusinessOwner]
    parser_classes = [MultiPartParser, FormParser]
    throttle_scope = "business_image"

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def _business(self, request) -> Business:
        try:
            return request.user.owned_business
        except Business.DoesNotExist:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)

    def get(self, request):
        business = self._business(request)
        images = business.gallery_images.all()
        return success_response({"results": BusinessImageSerializer(images, many=True).data})

    def post(self, request):
        business = self._business(request)
        serializer = GalleryUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        gallery_image = add_gallery_image(business, serializer.validated_data["image"])
        return success_response(BusinessImageSerializer(gallery_image).data, status=201)


class GalleryDetailView(APIView):
    """DELETE /api/business/gallery/<id>/ — remove a gallery image.

    Owner-only (``IsBusinessOwner``). Only images that belong to the authenticated
    owner's business may be deleted (foreign ids yield 404).
    """

    permission_classes = [IsBusinessOwner]

    def delete(self, request, image_id):
        try:
            business = request.user.owned_business
        except Business.DoesNotExist:
            raise JaqynAPIException("VALIDATION_ERROR", "Business not found", status_code=404)

        remove_gallery_image(business, str(image_id))
        return success_response(message="Gallery image removed")


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


def _distance_from_serialized(item, lat, lng):
    """Great-circle km from (lat, lng) to a *serialized* business dict, rounded to
    1 decimal to match ``PublicBusinessSerializer.get_distance_km``; ``None`` when
    the business has no coordinates."""
    raw_lat, raw_lng = item.get("latitude"), item.get("longitude")
    if raw_lat is None or raw_lng is None:
        return None
    return round(_distance_km(lat, lng, float(raw_lat), float(raw_lng)), 1)


def _distance_km(lat1, lng1, lat2, lng2):
    radius = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return radius * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))
