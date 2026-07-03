from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.leads.models import Lead, LeadColumn, LeadStatus


@admin.register(LeadColumn)
class LeadColumnAdmin(ModelAdmin):
    list_display = ("label", "key", "type", "order", "is_visible")
    list_editable = ("order", "is_visible")


@admin.register(LeadStatus)
class LeadStatusAdmin(ModelAdmin):
    list_display = ("name", "color", "order", "is_default")
    list_editable = ("color", "order", "is_default")


@admin.register(Lead)
class LeadAdmin(ModelAdmin):
    list_display = ("__str__", "status", "created_by", "created_at")
    list_filter = ("status", "created_by")
    list_select_related = ("status", "created_by")
