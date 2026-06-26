from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.system.models import SystemConfiguration


@admin.register(SystemConfiguration)
class SystemConfigurationAdmin(ModelAdmin):
    list_display = ("__str__", "max_active_groups_per_user", "updated_at")
    readonly_fields = ("updated_at",)

    def has_add_permission(self, request):
        # Singleton — only allow creating the row once.
        return not SystemConfiguration.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
