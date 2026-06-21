import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("jaqyn")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "rotate-approval-codes-daily": {
        "task": "apps.qr.tasks.rotate_approval_codes",
        "schedule": 60 * 60 * 24,
    },
    "expire-rewards-hourly": {
        "task": "apps.loyalty.tasks.expire_rewards",
        "schedule": 60 * 60,
    },
    "expire-old-groups-hourly": {
        "task": "apps.qr.tasks.expire_old_groups",
        "schedule": 60 * 60,
    },
}
