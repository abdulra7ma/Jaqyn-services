"""Celery tasks for the patches app (spec §A).

Every task is idempotent, takes ids (never model instances), and sets
max_retries, retry_backoff, and a hard time_limit. Task enqueues go via
transaction.on_commit from the service layer.
"""

from __future__ import annotations

from celery import shared_task

# Mirrors the campaigns app constants for consistency. Source: campaigns/tasks.py.
# Hard ceiling (seconds) on any single task run.
TASK_TIME_LIMIT_SECONDS: int = 60
# Retry budget for transient failures.
TASK_MAX_RETRIES: int = 3


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def evaluate_patches(self, user_id: str, event: str, meta: dict) -> list[str]:
    """Evaluate all active patch rules for user_id after a qualifying event.

    Idempotent: re-running with the same state is a no-op (earned_at is set
    exactly once under a row lock in PatchProgressService). Takes user_id as a
    string (not a model instance) per the Celery-with-Postgres rule.

    Returns the list of newly earned patch slugs (may be empty).
    """
    from apps.patches.services.progress import PatchProgressService

    try:
        return PatchProgressService.handle_event(user_id, event, meta)
    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def notify_patch_earned(self, user_id: str, patch_slug: str) -> dict[str, str]:
    """Notify a customer they earned a patch. Scheduled via on_commit.

    Routes through the Notifier so preference handling is centralised.
    Returns {"log_id": str} of the NotificationLog row.
    """
    from apps.accounts.models import User
    from apps.notifications.services import notifier
    from apps.patches.models import PatchDef

    try:
        user = User.objects.get(id=user_id)
        patch = PatchDef.objects.get(slug=patch_slug)
    except (User.DoesNotExist, PatchDef.DoesNotExist):
        return {"log_id": ""}

    log = notifier.send(
        recipient=user,
        channel="sms",
        event="patch_earned",
        payload={"patch_slug": patch_slug, "patch_name": patch.name},
    )
    return {"log_id": str(log.id)}
