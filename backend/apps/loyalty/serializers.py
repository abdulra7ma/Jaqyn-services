from rest_framework import serializers

from apps.loyalty.models import LoyaltyProgram, LoyaltyTransaction, LoyaltyVoucher


class LoyaltyProgramWriteSerializer(serializers.ModelSerializer):
    catalog_item_id = serializers.UUIDField(
        required=False, allow_null=True, write_only=True
    )

    class Meta:
        model = LoyaltyProgram
        fields = (
            "type",
            "name",
            "description",
            "image",
            "points_basis",
            "points_per_visit",
            "points_per_som",
            "cashback_per_point",
            "min_redeem_points",
            "required_count",
            "max_banked",
            "reward_type",
            "reward_title",
            "reward_description",
            "reward_expiry_days",
            "item_selection",
            "catalog_item_id",
            "active_days",
            "active_start_time",
            "active_end_time",
        )


class LoyaltyProgramSerializer(serializers.ModelSerializer):
    business_name = serializers.CharField(source="business.name", read_only=True)
    business_logo_url = serializers.SerializerMethodField()
    catalog_item_id = serializers.UUIDField(
        source="catalog_item.id", read_only=True, allow_null=True
    )
    reward_summary = serializers.SerializerMethodField()

    class Meta:
        model = LoyaltyProgram
        fields = (
            "id",
            "business",
            "business_name",
            "business_logo_url",
            "type",
            "status",
            "name",
            "description",
            "image",
            "points_basis",
            "points_per_visit",
            "points_per_som",
            "cashback_per_point",
            "min_redeem_points",
            "required_count",
            "max_banked",
            "reward_type",
            "reward_title",
            "reward_description",
            "reward_expiry_days",
            "item_selection",
            "catalog_item_id",
            "active_days",
            "active_start_time",
            "active_end_time",
            "reward_summary",
            "created_at",
            "updated_at",
        )

    def get_business_logo_url(self, obj: LoyaltyProgram) -> str | None:
        return obj.business.logo.url if obj.business.logo else None

    def get_reward_summary(self, obj: LoyaltyProgram) -> str:
        return obj.reward_title or (
            "Cashback" if obj.type == LoyaltyProgram.Type.POINTS else "Reward"
        )


class LoyaltyCardSerializer(serializers.Serializer):
    program_id = serializers.UUIDField()
    business_id = serializers.UUIDField()
    business_name = serializers.CharField()
    business_logo_url = serializers.CharField(allow_null=True)
    business_card_accent = serializers.CharField(allow_blank=True)
    business_category = serializers.CharField(allow_blank=True)
    business_area = serializers.CharField(allow_blank=True)
    business_hours = serializers.JSONField()
    type = serializers.CharField()
    name = serializers.CharField()
    reward_summary = serializers.CharField()
    reward_expiry_days = serializers.IntegerField()
    joined = serializers.BooleanField()
    stamps_count = serializers.IntegerField()
    visits_count = serializers.IntegerField()
    required_count = serializers.IntegerField(allow_null=True)
    points_balance = serializers.IntegerField()
    min_redeem_points = serializers.IntegerField(allow_null=True)
    points_per_som = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )
    cashback_per_point = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )
    pct_back = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True
    )


class LoyaltyHomeSummarySerializer(serializers.Serializer):
    visit_streak_days = serializers.IntegerField(min_value=0)
    streak_active_today = serializers.BooleanField()
    featured_campaign_ids = serializers.ListField(child=serializers.UUIDField())
    rewards_earned = serializers.IntegerField(min_value=0)
    som_saved = serializers.DecimalField(max_digits=14, decimal_places=2)
    active_cards = serializers.IntegerField(min_value=0)


class LoyaltyTransactionSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(
        source="staff.name", read_only=True, allow_null=True
    )
    # The owner-facing ledger labels each row by the customer it affected.
    customer_name = serializers.CharField(
        source="customer.name", read_only=True, allow_null=True
    )

    class Meta:
        model = LoyaltyTransaction
        fields = (
            "id",
            "kind",
            "source",
            "points_delta",
            "stamps_delta",
            "bill_amount",
            "staff_name",
            "customer_name",
            "metadata",
            "created_at",
        )


class LoyaltyVoucherSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source="program.name", read_only=True)
    business_name = serializers.CharField(source="business.name", read_only=True)
    catalog_item_name = serializers.CharField(
        source="catalog_item.name", read_only=True, allow_null=True
    )
    qr_token = serializers.CharField(
        source="qr_token.token", read_only=True, allow_null=True
    )

    class Meta:
        model = LoyaltyVoucher
        fields = (
            "id",
            "program",
            "program_name",
            "business",
            "business_name",
            "voucher_code",
            "status",
            "reward_type",
            "reward_title",
            "cashback_amount",
            "catalog_item",
            "catalog_item_name",
            "qr_token",
            "issued_at",
            "expires_at",
            "redeemed_at",
        )


class RedeemPointsSerializer(serializers.Serializer):
    points = serializers.IntegerField(min_value=1)


class SelectItemSerializer(serializers.Serializer):
    catalog_item_id = serializers.UUIDField()


class AwardSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)
    program_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)


class RedeemVoucherSerializer(serializers.Serializer):
    """Staff redeem-voucher input — accepts a voucher code or the id from the scan sheet."""

    code = serializers.CharField(max_length=32, required=False)
    voucher_id = serializers.UUIDField(required=False)

    def validate(self, attrs: dict) -> dict:
        if not attrs.get("code") and not attrs.get("voucher_id"):
            raise serializers.ValidationError("code or voucher_id is required")
        return attrs


class ScanSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)
