from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.system.models import SystemConfiguration


@admin.register(SystemConfiguration)
class SystemConfigurationAdmin(ModelAdmin):
    list_display = ("__str__", "max_active_groups_per_user", "support_email", "updated_at")
    readonly_fields = ("updated_at",)
    fieldsets = (
        (None, {"fields": ("max_active_groups_per_user", "trial_period_days")}),
        (
            "Email branding",
            {
                "fields": ("support_email", "instagram_url", "telegram_url"),
                "description": "Shown in the footer of every outgoing email.",
            },
        ),
        (None, {"fields": ("updated_at",)}),
    )

    def has_add_permission(self, request):
        # Singleton — only allow creating the row once.
        return not SystemConfiguration.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
