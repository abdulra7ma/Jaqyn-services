from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.groups.models import GroupDeal, GroupMember, GroupOffer
from apps.groups.services import approve_group_offer, pause_group_offer, reject_group_offer


@admin.action(description="Approve selected group offers")
def approve_offers(modeladmin, request, queryset):
    for offer in queryset:
        approve_group_offer(offer, request.user)


@admin.action(description="Reject selected group offers")
def reject_offers(modeladmin, request, queryset):
    for offer in queryset:
        reject_group_offer(offer, request.user)


@admin.action(description="Pause selected group offers")
def pause_offers(modeladmin, request, queryset):
    for offer in queryset:
        pause_group_offer(offer)


@admin.register(GroupOffer)
class GroupOfferAdmin(ModelAdmin):
    list_display = ("title", "business", "status", "min_group_size", "valid_from", "valid_to", "created_at")
    list_filter = ("status", "category", "reward_type")
    search_fields = ("title", "business__name")
    list_select_related = ("business",)
    actions = [approve_offers, reject_offers, pause_offers]


@admin.register(GroupDeal)
class GroupDealAdmin(ModelAdmin):
    list_display = ("group_offer", "leader", "visit_time", "status", "reward_code", "redeemed_at", "created_at")
    list_filter = ("status",)
    search_fields = ("group_offer__title", "leader__phone", "invite_token", "reward_code")
    list_select_related = ("group_offer", "leader")


@admin.register(GroupMember)
class GroupMemberAdmin(ModelAdmin):
    list_display = ("group_deal", "customer", "status", "checked_in_at", "created_at")
    list_filter = ("status",)
    search_fields = ("customer__phone", "group_deal__group_offer__title")
    list_select_related = ("group_deal", "customer")
