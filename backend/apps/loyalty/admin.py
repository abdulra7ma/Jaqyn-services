from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption, RewardTransaction


@admin.register(RewardProgram)
class RewardProgramAdmin(ModelAdmin):
    list_display = ("title", "business", "type", "required_count", "is_active", "created_at")
    list_filter = ("type", "is_active")
    search_fields = ("title", "business__name")
    list_select_related = ("business",)


@admin.register(CustomerRewardProgress)
class CustomerRewardProgressAdmin(ModelAdmin):
    list_display = ("customer", "business", "reward_program", "current_count", "target_count", "status", "updated_at")
    list_filter = ("status",)
    search_fields = ("customer__phone", "business__name", "reward_program__title")
    list_select_related = ("customer", "business", "reward_program")


@admin.register(RewardTransaction)
class RewardTransactionAdmin(ModelAdmin):
    list_display = ("customer", "business", "reward_program", "action", "amount_count", "source", "created_at")
    list_filter = ("action", "source")
    search_fields = ("customer__phone", "business__name", "reward_program__title")
    list_select_related = ("customer", "business", "reward_program")


@admin.register(RewardRedemption)
class RewardRedemptionAdmin(ModelAdmin):
    list_display = ("customer", "business", "reward_program", "code", "status", "expires_at", "created_at")
    list_filter = ("status",)
    search_fields = ("customer__phone", "business__name", "code")
    list_select_related = ("customer", "business", "reward_program")
