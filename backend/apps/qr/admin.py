from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.qr.models import QRCodeToken, ScanLog


@admin.register(QRCodeToken)
class QRCodeTokenAdmin(ModelAdmin):
    list_display = ("token", "type", "business", "is_active", "expires_at", "created_at")
    list_filter = ("type", "is_active")
    search_fields = ("token", "business__name")
    list_select_related = ("business",)


@admin.register(ScanLog)
class ScanLogAdmin(ModelAdmin):
    list_display = ("action", "status", "business", "customer", "failure_reason", "created_at")
    list_filter = ("action", "status", "failure_reason")
    search_fields = ("token_value", "business__name", "customer__phone")
    list_select_related = ("business", "customer")
