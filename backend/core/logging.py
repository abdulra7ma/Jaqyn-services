import logging

from django.apps import apps

logger = logging.getLogger(__name__)


def emit_event(name, **payload):
    logger.info("analytics_event name=%s payload=%s", name, payload)


def log_scan(**kwargs):
    ScanLog = apps.get_model("qr", "ScanLog")
    return ScanLog.objects.create(**kwargs)
