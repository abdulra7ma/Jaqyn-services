from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.notifications.models import NotificationLog, NotificationPreference


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(ModelAdmin):
    list_display = ("user", "sms_enabled", "email_enabled", "group_reminders", "reward_updates", "business_reports", "updated_at")
    search_fields = ("user__phone", "user__email")
    list_select_related = ("user",)


@admin.register(NotificationLog)
class NotificationLogAdmin(ModelAdmin):
    list_display = ("event", "channel", "recipient", "status", "created_at")
    list_filter = ("event", "channel", "status")
    search_fields = ("recipient__phone", "event")
    list_select_related = ("recipient",)
