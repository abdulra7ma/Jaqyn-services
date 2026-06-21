from django.contrib import admin

from apps.qr.models import ApprovalCode, QRCodeToken, ScanLog


@admin.register(QRCodeToken)
class QRCodeTokenAdmin(admin.ModelAdmin):
    list_display = ("token", "type", "business", "is_active", "expires_at", "created_at")
    list_filter = ("type", "is_active")
    search_fields = ("token", "business__name")


@admin.register(ApprovalCode)
class ApprovalCodeAdmin(admin.ModelAdmin):
    list_display = ("business", "code", "valid_from", "valid_to", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("business__name", "code")


@admin.register(ScanLog)
class ScanLogAdmin(admin.ModelAdmin):
    list_display = ("action", "status", "business", "customer", "failure_reason", "created_at")
    list_filter = ("action", "status", "failure_reason")
    search_fields = ("token_value", "business__name", "customer__phone")
