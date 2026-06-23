from django.contrib import admin

from apps.campaigns.models import (
    Campaign,
    CampaignAction,
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
    CampaignRule,
    GroupSession,
    GroupSessionMember,
)


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "campaign_type", "status", "start_at", "end_at", "created_at")
    list_filter = ("campaign_type", "status")
    search_fields = ("name", "business__name")


@admin.register(CampaignRule)
class CampaignRuleAdmin(admin.ModelAdmin):
    list_display = ("campaign", "rule_type", "required_count", "max_count_per_day", "required_group_size")
    list_filter = ("rule_type",)
    search_fields = ("campaign__name",)


@admin.register(CampaignReward)
class CampaignRewardAdmin(admin.ModelAdmin):
    list_display = ("title", "campaign", "reward_type", "estimated_cost", "max_redemptions", "created_at")
    list_filter = ("reward_type", "reward_receiver_type")
    search_fields = ("title", "campaign__name")


@admin.register(CampaignParticipant)
class CampaignParticipantAdmin(admin.ModelAdmin):
    list_display = ("customer", "campaign", "status", "progress_count", "completion_cycle", "last_progress_at")
    list_filter = ("status",)
    search_fields = ("customer__phone", "campaign__name")


@admin.register(CampaignAction)
class CampaignActionAdmin(admin.ModelAdmin):
    list_display = ("customer", "campaign", "action_type", "verification_method", "status", "action_time")
    list_filter = ("action_type", "verification_method", "status")
    search_fields = ("customer__phone", "campaign__name")


@admin.register(CampaignRewardVoucher)
class CampaignRewardVoucherAdmin(admin.ModelAdmin):
    list_display = ("voucher_code", "customer", "campaign", "status", "issued_at", "expires_at", "redeemed_at")
    list_filter = ("status",)
    search_fields = ("voucher_code", "customer__phone", "campaign__name")


@admin.register(GroupSession)
class GroupSessionAdmin(admin.ModelAdmin):
    list_display = ("invite_token", "campaign", "group_leader", "status", "required_size", "expires_at")
    list_filter = ("status",)
    search_fields = ("invite_token", "campaign__name", "group_leader__phone")


@admin.register(GroupSessionMember)
class GroupSessionMemberAdmin(admin.ModelAdmin):
    list_display = ("customer", "group_session", "status", "joined_at", "checked_in_at")
    list_filter = ("status",)
    search_fields = ("customer__phone",)
