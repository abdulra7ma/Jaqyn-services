import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("jaqyn")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "expire-old-groups-hourly": {
        "task": "apps.campaigns.tasks.expire_old_groups",
        "schedule": 60 * 60,
    },
    "expire-campaign-vouchers-hourly": {
        "task": "apps.campaigns.tasks.expire_campaign_vouchers",
        "schedule": 60 * 60,
    },
    "transition-campaign-lifecycle": {
        "task": "apps.campaigns.tasks.transition_campaign_lifecycle",
        "schedule": 60 * 15,
    },
    "sweep-campaign-fraud-hourly": {
        "task": "apps.campaigns.tasks.sweep_campaign_fraud",
        "schedule": 60 * 60,
    },
    "notify-vouchers-expiring-soon": {
        "task": "apps.campaigns.tasks.notify_vouchers_expiring_soon",
        "schedule": 60 * 60,
    },
    "notify-campaigns-ending-soon": {
        "task": "apps.campaigns.tasks.notify_campaigns_ending_soon",
        "schedule": 60 * 60,
    },
}
