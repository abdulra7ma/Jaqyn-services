from celery import shared_task

from apps.qr.services import rotate_codes_for_all_businesses


@shared_task
def rotate_approval_codes():
    return rotate_codes_for_all_businesses()
