from rest_framework import serializers

from apps.businesses.models import Business, BusinessType, CatalogItem, StaffInvite


class BusinessTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessType
        fields = ("id", "key", "name", "glyph", "description", "module", "sort_order")
        read_only_fields = fields


class BusinessSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source="name", required=False)
    completion_score = serializers.SerializerMethodField()
    missing_required_fields = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()

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
            "created_at",
        )
        read_only_fields = (
            "id",
            "business_code",
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


class PublicBusinessSerializer(serializers.ModelSerializer):
    """Customer-facing business profile — safe public fields only (no business_code)."""

    reward = serializers.SerializerMethodField()
    rewards = serializers.SerializerMethodField()
    group_offers = serializers.SerializerMethodField()
    catalog_sections = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()

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
            "distance_km",
        )
        read_only_fields = fields

    def get_reward(self, obj):
        program = obj.reward_programs.filter(is_active=True).order_by("-created_at").first()
        return program.reward_description if program else None

    def get_rewards(self, obj):
        return [
            {
                "id": str(program.id),
                "type": program.type,
                "title": program.title,
                "description": program.description,
                "required_count": program.required_count,
                "reward_description": program.reward_description,
                "terms": program.terms,
            }
            for program in obj.reward_programs.filter(is_active=True).order_by("-created_at")[:3]
        ]

    def get_group_offers(self, obj):
        return [
            {
                "id": str(offer.id),
                "title": offer.title,
                "description": offer.description,
                "reward_type": offer.reward_type,
                "reward_description": offer.reward_description,
                "min_group_size": offer.min_group_size,
                "max_group_size": offer.max_group_size,
                "time_start": offer.time_start.strftime("%H:%M"),
                "time_end": offer.time_end.strftime("%H:%M"),
                "terms": offer.terms,
                "status": offer.status,
            }
            for offer in obj.group_offers.filter(status="active").order_by("-created_at")[:3]
        ]

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
                }
            )
        return [{"title": title, "items": items} for title, items in sections.items()]

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


class BusinessImageUploadSerializer(serializers.Serializer):
    """Brand-asset upload input — a single ``image`` file (logo or cover).

    ``ImageField`` enforces that the upload is a decodable image (shape/format
    validation). Compression + persistence is the service's concern.
    """

    image = serializers.ImageField()


class CatalogItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CatalogItem
        fields = ("id", "module", "name", "category", "price", "duration", "sort_order", "is_active")
        read_only_fields = ("id",)


class StaffInviteSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffInvite
        fields = ("id", "full_name", "contact", "role", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")


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
