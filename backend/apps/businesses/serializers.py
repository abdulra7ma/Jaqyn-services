from rest_framework import serializers
from django.core.validators import RegexValidator

from apps.businesses.models import Business, BusinessImage, BusinessType, CatalogItem, StaffInvite
from apps.staff.services import ACTIVITY_KINDS
from core.validators import validate_image_size


class BusinessTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessType
        fields = ("id", "key", "name", "glyph", "description", "module", "sort_order")
        read_only_fields = fields


class BusinessCategorySerializer(serializers.Serializer):
    """Read-only shape for one ``Business.Category`` choice: enum value + human label.

    Lets the customer discovery filter pull its options from the model's source of truth
    instead of hardcoding the category list on the client.
    """

    value = serializers.CharField()
    label = serializers.CharField()


class BusinessSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source="name", required=False)
    completion_score = serializers.SerializerMethodField()
    missing_required_fields = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()
    owner_is_staff = serializers.SerializerMethodField()

    class Meta:
        model = Business
        fields = (
            "id",
            "business_code",
            "name",
            "display_name",
            "legal_name",
            "category",
            "business_type",
            "description",
            "address",
            "area",
            "city",
            "country",
            "latitude",
            "longitude",
            "phone",
            "public_email",
            "website_url",
            "instagram_url",
            "logo_set",
            "cover_set",
            "logo_url",
            "cover_url",
            "glyph",
            "accent_color",
            "card_accent",
            "price_level",
            "tags",
            "working_hours",
            "menu_style",
            "default_currency",
            "default_language",
            "timezone",
            "status",
            "onboarding_status",
            "verification_status",
            "visibility_status",
            "change_note",
            "completion_score",
            "missing_required_fields",
            "owner_is_staff",
            "created_at",
        )
        read_only_fields = (
            "id",
            "business_code",
            "owner_is_staff",
            # logo_set / cover_set are set server-side by set_business_logo /
            # set_business_cover (services.py). Clients must upload a real image via
            # the dedicated upload endpoint — these flags cannot be faked via PATCH.
            "logo_set",
            "cover_set",
            "status",
            "onboarding_status",
            "verification_status",
            "visibility_status",
            "change_note",
            "completion_score",
            "missing_required_fields",
            "created_at",
        )

    def get_completion_score(self, obj):
        from apps.businesses.onboarding_services import completion_score

        return completion_score(obj)

    def get_missing_required_fields(self, obj):
        from apps.businesses.onboarding_services import missing_required

        return missing_required(obj)

    def get_logo_url(self, obj):
        # Relative /media/... url (via MEDIA_URL) so it passes through the
        # frontend proxy; None when no logo is set.
        return obj.logo.url if obj.logo else None

    def get_cover_url(self, obj):
        # Relative /media/... url (via MEDIA_URL) so it passes through the
        # frontend proxy; None when no cover is set.
        return obj.cover_image.url if obj.cover_image else None

    def get_owner_is_staff(self, obj) -> bool:
        # True when the owner holds an active staff seat — drives the owner→staff
        # switch and its settings toggle. See staff ensure_owner_staff.
        if obj.owner_id is None:
            return False
        return obj.staff_members.filter(user_id=obj.owner_id, is_active=True).exists()


class PublicBusinessSerializer(serializers.ModelSerializer):
    """Customer-facing business profile — safe public fields only (no business_code)."""

    reward = serializers.SerializerMethodField()
    rewards = serializers.SerializerMethodField()
    group_offers = serializers.SerializerMethodField()
    catalog_sections = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()
    gallery = serializers.SerializerMethodField()

    class Meta:
        model = Business
        fields = (
            "id",
            "name",
            "category",
            "description",
            "address",
            "area",
            "latitude",
            "longitude",
            "phone",
            "public_email",
            "website_url",
            "instagram_url",
            "logo_url",
            "cover_url",
            "glyph",
            "accent_color",
            "price_level",
            "tags",
            "working_hours",
            "reward",
            "rewards",
            "group_offers",
            "catalog_sections",
            "gallery",
            "distance_km",
        )
        read_only_fields = fields

    def _active_individual_campaigns(self, obj):
        """ACTIVE INDIVIDUAL campaigns for a business, newest first (≤3).

        Post-restructure a loyalty reward program is an INDIVIDUAL campaign, so the
        public reward surface reads from campaigns. Filters in memory off the
        prefetched ``campaigns`` to keep the discovery payload N+1-free.
        """
        from apps.campaigns.models import Campaign

        rows = [
            c
            for c in obj.campaigns.all()
            if c.status == Campaign.Status.ACTIVE
            and c.campaign_type == Campaign.CampaignType.INDIVIDUAL
        ]
        rows.sort(key=lambda c: c.created_at, reverse=True)
        return rows[:3]

    def get_reward(self, obj):
        campaigns = self._active_individual_campaigns(obj)
        if not campaigns:
            return None
        reward = getattr(campaigns[0], "reward", None)
        return reward.description if reward is not None else None

    def get_rewards(self, obj):
        result = []
        for campaign in self._active_individual_campaigns(obj):
            rule = getattr(campaign, "rule", None)
            reward = getattr(campaign, "reward", None)
            result.append(
                {
                    "id": str(campaign.id),
                    "type": getattr(rule, "mechanic", None) or campaign.campaign_type,
                    "title": campaign.name,
                    "description": campaign.description or "",
                    "required_count": getattr(rule, "required_count", None),
                    "reward_description": reward.description if reward is not None else "",
                    "terms": "",
                }
            )
        return result

    def get_group_offers(self, obj):
        from apps.campaigns.models import Campaign

        rows = [
            c
            for c in obj.campaigns.all()
            if c.status == Campaign.Status.ACTIVE
            and c.campaign_type == Campaign.CampaignType.GROUP
        ]
        rows.sort(key=lambda c: c.created_at, reverse=True)
        result = []
        for campaign in rows[:3]:
            rule = getattr(campaign, "rule", None)
            reward = getattr(campaign, "reward", None)
            result.append(
                {
                    "id": str(campaign.id),
                    "title": campaign.name,
                    "description": campaign.description or "",
                    "reward_type": getattr(reward, "reward_type", None),
                    "reward_description": reward.description if reward is not None else "",
                    "min_group_size": getattr(rule, "required_group_size", None),
                    "max_group_size": getattr(rule, "required_group_size", None),
                    "time_start": campaign.active_start_time.strftime("%H:%M"),
                    "time_end": campaign.active_end_time.strftime("%H:%M"),
                    "terms": "",
                    "status": campaign.status,
                }
            )
        return result

    def get_catalog_sections(self, obj):
        sections = {}
        for item in obj.catalog_items.filter(is_active=True).order_by("sort_order", "created_at"):
            key = item.category or "Featured"
            sections.setdefault(key, []).append(
                {
                    "id": str(item.id),
                    "module": item.module,
                    "name": item.name,
                    "category": item.category,
                    "price": item.price,
                    "duration": item.duration,
                    # Product photo: relative /media/... URL or None.
                    "image_url": item.image.url if item.image else None,
                }
            )
        return [{"title": title, "items": items} for title, items in sections.items()]

    def get_gallery(self, obj):
        """Return the ordered gallery images for the public business page."""
        return BusinessImageSerializer(
            obj.gallery_images.all(), many=True
        ).data

    def get_distance_km(self, obj):
        distance = getattr(obj, "distance_km", None)
        return round(distance, 1) if distance is not None else None

    def get_logo_url(self, obj):
        if not obj.logo:
            return None
        request = self.context.get("request")
        url = obj.logo.url
        return request.build_absolute_uri(url) if request else url

    def get_cover_url(self, obj):
        if not obj.cover_image:
            return None
        request = self.context.get("request")
        url = obj.cover_image.url
        return request.build_absolute_uri(url) if request else url


class OwnerStaffToggleSerializer(serializers.Serializer):
    """Input for the owner "work as staff" toggle. Defaults to enabling the seat."""

    enabled = serializers.BooleanField(default=True)


class BusinessImageUploadSerializer(serializers.Serializer):
    """Brand-asset upload input — a single ``image`` file (logo or cover).

    ``ImageField`` enforces that the upload is a decodable image (shape/format
    validation). Compression + persistence is the service's concern.
    ``validate_image_size`` caps the upload at MAX_IMAGE_UPLOAD_BYTES (5 MB) so
    the compressor never receives an oversized file and R2 storage is bounded.
    """

    image = serializers.ImageField(validators=[validate_image_size])


class BusinessImageSerializer(serializers.ModelSerializer):
    """Read-only shape for a single business gallery photo.

    ``image_url`` is a relative ``/media/...`` URL (passes through the frontend
    proxy). The frontend contract requires exactly: id, image_url, caption, sort_order.
    """

    image_url = serializers.SerializerMethodField()

    class Meta:
        model = BusinessImage
        fields = ("id", "image_url", "caption", "sort_order")
        read_only_fields = fields

    def get_image_url(self, obj: BusinessImage) -> str | None:
        # Relative /media/... URL so it passes through the frontend Next.js proxy.
        return obj.image.url if obj.image else None


class GalleryUploadSerializer(serializers.Serializer):
    """Shape validation for a gallery image upload — a single ``image`` file.

    ``ImageField`` ensures the upload is a decodable image. Compression +
    persistence is the service's concern; this serializer validates shape only.
    ``validate_image_size`` caps the upload at MAX_IMAGE_UPLOAD_BYTES (5 MB).
    """

    image = serializers.ImageField(validators=[validate_image_size])


class CatalogItemSerializer(serializers.ModelSerializer):
    """CatalogItem with an optional product photo URL.

    ``image_url`` is a read-only SerializerMethodField that returns a relative
    ``/media/...`` path when the item has an image, or ``None``. It is excluded
    from writable fields so clients cannot set it via the catalog PATCH endpoint —
    they must use the dedicated image-upload endpoint.
    """

    image_url = serializers.SerializerMethodField()

    class Meta:
        model = CatalogItem
        fields = ("id", "module", "name", "category", "price", "duration", "sort_order", "is_active", "image_url")
        read_only_fields = ("id", "image_url")

    def get_image_url(self, obj: CatalogItem) -> str | None:
        # Relative /media/... URL so it passes through the frontend proxy; None
        # when no product image has been uploaded yet.
        return obj.image.url if obj.image else None


class StaffInviteSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffInvite
        fields = ("id", "full_name", "contact", "role", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")


class DashboardActivityEventSerializer(serializers.Serializer):
    """Serializes one :class:`apps.staff.services.ActivityEvent` for the owner dashboard.

    A deliberate five-field mirror of the staff feed's event shape, defined here
    so the businesses service consumes the staff activity service's public surface
    (the ``ActivityEvent`` dataclass + ``ACTIVITY_KINDS``) rather than reaching
    into ``apps.staff.serializers`` — presentation stays inside each boundary.
    ``customer`` is already masked upstream; ``label`` is untranslated data
    context (reward / program / campaign name) the frontend wraps in copy.
    """

    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=ACTIVITY_KINDS)
    customer = serializers.CharField(allow_blank=True)
    label = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()


class BusinessAdminActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


# ---- onboarding / activation ----


class OwnerInviteActivateSerializer(serializers.Serializer):
    token = serializers.CharField()
    full_name = serializers.CharField(max_length=255)
    password = serializers.CharField(min_length=6, write_only=True)


class VerifyActionSerializer(serializers.Serializer):
    publish = serializers.BooleanField(required=False, default=True)
    admin_notes = serializers.CharField(required=False, allow_blank=True)


class RequestChangesSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True)


class BusinessLeadSerializer(serializers.Serializer):
    """Shape/format validation for a public landing-page lead submission.

    Validates the incoming payload from the landing form. Business-rule mapping
    (category normalisation, owner-less Business creation) lives in the service.
    Fields: name, owner_name, email, phone are required; category, area, and
    instagram_url are optional (the business can supply them during onboarding).
    """

    name = serializers.CharField(max_length=255)
    owner_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    # E.164-ish: optional leading +, then 7-15 digits only.
    # Rejects compound values like '+996+996...' or alphabetic garbage at the API boundary.
    phone = serializers.CharField(
        max_length=32,
        validators=[
            RegexValidator(
                r"^\+?\d{7,15}$",
                message="Enter a valid phone number (7-15 digits, optional leading +).",
            )
        ],
    )
    category = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    area = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    instagram_url = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
