from django.contrib import admin

from apps.businesses.models import Business, BusinessOwnerInvite, BusinessType, CatalogItem, StaffInvite
from apps.businesses.services import approve_business, disable_business, reject_business


@admin.action(description="Approve selected businesses")
def approve_businesses(modeladmin, request, queryset):
    for business in queryset:
        approve_business(business, request.user)


@admin.action(description="Reject selected businesses")
def reject_businesses(modeladmin, request, queryset):
    for business in queryset:
        reject_business(business, request.user)


@admin.action(description="Disable selected businesses")
def disable_businesses(modeladmin, request, queryset):
    for business in queryset:
        disable_business(business, request.user)


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "category", "area", "status", "onboarding_status", "verification_status", "created_at")
    list_filter = ("status", "onboarding_status", "verification_status", "category", "area")
    search_fields = ("name", "owner__phone", "phone", "address")
    actions = [approve_businesses, reject_businesses, disable_businesses]


@admin.register(BusinessType)
class BusinessTypeAdmin(admin.ModelAdmin):
    list_display = ("key", "name", "module", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")


@admin.register(CatalogItem)
class CatalogItemAdmin(admin.ModelAdmin):
    list_display = ("name", "business", "module", "category", "price", "is_active")
    list_filter = ("module", "is_active")
    search_fields = ("name", "business__name")


@admin.register(StaffInvite)
class StaffInviteAdmin(admin.ModelAdmin):
    list_display = ("full_name", "contact", "business", "role", "status", "created_at")
    list_filter = ("role", "status")


@admin.register(BusinessOwnerInvite)
class BusinessOwnerInviteAdmin(admin.ModelAdmin):
    list_display = ("email", "phone", "business", "status", "expires_at", "accepted_at")
    list_filter = ("status",)
