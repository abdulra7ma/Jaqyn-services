from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.staff.models import StaffMember


@admin.register(StaffMember)
class StaffMemberAdmin(ModelAdmin):
    list_display = ("name", "business", "role", "is_active", "created_at")
    list_filter = ("role", "is_active")
    search_fields = ("name", "business__name", "business__owner__phone")
    list_select_related = ("business",)
