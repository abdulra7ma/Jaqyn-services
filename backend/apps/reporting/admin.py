from django.contrib import admin

from apps.reporting.models import AdminAuditLog


@admin.register(AdminAuditLog)
class AdminAuditLogAdmin(admin.ModelAdmin):
    list_display = ("action", "target_type", "target_id", "admin", "created_at")
    list_filter = ("action", "target_type")
    search_fields = ("target_id", "admin__phone", "reason")
