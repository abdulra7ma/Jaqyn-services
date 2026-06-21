from rest_framework import serializers

from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption


class RewardProgramSerializer(serializers.ModelSerializer):
    business_name = serializers.CharField(source="business.name", read_only=True)
    enrolled = serializers.SerializerMethodField()
    redeemed_count = serializers.SerializerMethodField()

    class Meta:
        model = RewardProgram
        fields = (
            "id",
            "business",
            "business_name",
            "type",
            "title",
            "description",
            "required_count",
            "required_spend",
            "reward_description",
            "minimum_spend",
            "expiry_days",
            "max_redemptions_per_customer",
            "max_banked",
            "terms",
            "is_active",
            "enrolled",
            "redeemed_count",
            "created_at",
        )
        read_only_fields = ("id", "business", "business_name", "is_active", "enrolled", "redeemed_count", "created_at")

    def get_enrolled(self, obj):
        return obj.progress.count()

    def get_redeemed_count(self, obj):
        return obj.progress.filter(status=CustomerRewardProgress.Status.REDEEMED).count()


class RewardRedemptionSerializer(serializers.ModelSerializer):
    reward_title = serializers.CharField(source="reward_program.title", read_only=True)

    class Meta:
        model = RewardRedemption
        fields = ("id", "code", "status", "presented_at", "redeemed_at", "expires_at", "created_at", "reward_title")


class WalletRewardSerializer(serializers.Serializer):
    """Grouped PENDING vouchers for one (business, reward_program)."""
    business = serializers.DictField()
    reward = serializers.DictField()
    count = serializers.IntegerField()
    soonest_expiry = serializers.DateTimeField(allow_null=True)
    redemption_ids = serializers.ListField(child=serializers.CharField())


class WalletSerializer(serializers.Serializer):
    available = WalletRewardSerializer(many=True)
    in_progress = serializers.ListField(child=serializers.DictField())


class CustomerRewardProgressSerializer(serializers.ModelSerializer):
    reward_program = RewardProgramSerializer(read_only=True)
    redemption = serializers.SerializerMethodField()
    business_name = serializers.CharField(source="business.name", read_only=True)
    business_area = serializers.CharField(source="business.area", read_only=True)

    class Meta:
        model = CustomerRewardProgress
        fields = (
            "id",
            "business",
            "business_name",
            "business_area",
            "reward_program",
            "current_count",
            "current_spend",
            "target_count",
            "status",
            "unlocked_at",
            "expires_at",
            "redemption",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_redemption(self, obj):
        redemption = obj.redemptions.order_by("-created_at").first()
        return RewardRedemptionSerializer(redemption).data if redemption else None


class CollectSerializer(serializers.Serializer):
    approval_code = serializers.CharField(min_length=4, max_length=12)
    reward_program = serializers.UUIDField(required=False)


class StaffRedeemSerializer(serializers.Serializer):
    code = serializers.CharField(required=False, max_length=64)
    token = serializers.CharField(required=False, max_length=128)

    def validate(self, attrs):
        if not attrs.get("code") and not attrs.get("token"):
            raise serializers.ValidationError("code or token is required")
        return attrs
