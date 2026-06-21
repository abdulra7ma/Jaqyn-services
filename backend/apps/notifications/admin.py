from django.contrib import admin

from apps.notifications.models import NotificationLog, NotificationPreference


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("user", "sms_enabled", "email_enabled", "group_reminders", "reward_updates", "business_reports", "updated_at")
    search_fields = ("user__phone", "user__email")


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = ("event", "channel", "recipient", "status", "created_at")
    list_filter = ("event", "channel", "status")
    search_fields = ("recipient__phone", "event")
