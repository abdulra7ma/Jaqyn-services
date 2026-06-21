from rest_framework import serializers

from apps.groups.models import GroupDeal, GroupMember, GroupOffer


class GroupOfferSerializer(serializers.ModelSerializer):
    business_name = serializers.CharField(source="business.name", read_only=True)
    business_area = serializers.CharField(source="business.area", read_only=True)

    class Meta:
        model = GroupOffer
        fields = (
            "id",
            "business",
            "business_name",
            "business_area",
            "title",
            "description",
            "category",
            "min_group_size",
            "max_group_size",
            "min_paid_customers",
            "min_spend_per_person",
            "reward_type",
            "reward_description",
            "valid_from",
            "valid_to",
            "valid_days",
            "time_start",
            "time_end",
            "max_groups_per_day",
            "checkin_window_minutes",
            "requires_staff_code",
            "requires_staff_approval",
            "terms",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "business", "business_name", "business_area", "status", "created_at", "updated_at")

    def validate(self, attrs):
        min_size = attrs.get("min_group_size", getattr(self.instance, "min_group_size", None))
        max_size = attrs.get("max_group_size", getattr(self.instance, "max_group_size", None))
        if max_size is not None and min_size is not None and min_size > max_size:
            raise serializers.ValidationError({"max_group_size": "max_group_size must be >= min_group_size"})

        valid_from = attrs.get("valid_from", getattr(self.instance, "valid_from", None))
        valid_to = attrs.get("valid_to", getattr(self.instance, "valid_to", None))
        if valid_from and valid_to and valid_from > valid_to:
            raise serializers.ValidationError({"valid_to": "valid_to must be on or after valid_from"})

        time_start = attrs.get("time_start", getattr(self.instance, "time_start", None))
        time_end = attrs.get("time_end", getattr(self.instance, "time_end", None))
        if time_start and time_end and time_start >= time_end:
            raise serializers.ValidationError({"time_end": "time_end must be after time_start"})

        valid_days = attrs.get("valid_days", getattr(self.instance, "valid_days", None))
        if valid_days is not None and (not isinstance(valid_days, list) or not valid_days):
            raise serializers.ValidationError({"valid_days": "valid_days must be a non-empty list"})
        return attrs


class GroupMemberSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = GroupMember
        fields = ("id", "customer", "customer_name", "status", "checked_in_at", "created_at")
        read_only_fields = fields


class BusinessGroupDealSerializer(serializers.ModelSerializer):
    """Owner-facing 'Active groups today' row."""

    offer_title = serializers.CharField(source="group_offer.title", read_only=True)
    leader_name = serializers.CharField(source="leader.name", read_only=True)
    target_size = serializers.IntegerField(source="group_offer.min_group_size", read_only=True)
    joined = serializers.SerializerMethodField()
    checked_in = serializers.SerializerMethodField()

    class Meta:
        model = GroupDeal
        fields = ("id", "offer_title", "leader_name", "visit_time", "status", "target_size", "joined", "checked_in")
        read_only_fields = fields

    def get_joined(self, obj):
        return obj.members.exclude(status__in=[GroupMember.Status.LEFT, GroupMember.Status.REMOVED]).count()

    def get_checked_in(self, obj):
        return obj.members.filter(status=GroupMember.Status.CHECKED_IN).count()


class GroupDealSerializer(serializers.ModelSerializer):
    group_offer = GroupOfferSerializer(read_only=True)
    members = GroupMemberSerializer(many=True, read_only=True)

    class Meta:
        model = GroupDeal
        fields = (
            "id",
            "group_offer",
            "leader",
            "visit_time",
            "invite_token",
            "status",
            "reward_code",
            "completed_at",
            "redeemed_at",
            "members",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class CreateGroupDealSerializer(serializers.Serializer):
    group_offer = serializers.UUIDField()
    visit_time = serializers.DateTimeField()


class CheckInSerializer(serializers.Serializer):
    approval_code = serializers.CharField(required=False, allow_blank=True, max_length=12)
