"""Celery tasks for the campaigns app (plan §1.4).

Every task is idempotent, takes ids (never model instances), and sets
``max_retries``, ``retry_backoff``, and a hard ``time_limit``. Notification tasks
are scheduled only via ``transaction.on_commit`` from the service layer so the
worker never picks up an id before the outer transaction commits.
"""

from __future__ import annotations

from celery import shared_task

# Hard ceiling (seconds) on any single task run so a stuck task cannot pin a
# worker forever. Source: plan §1.4 (every task gets a hard time limit).
TASK_TIME_LIMIT_SECONDS: int = 60
# Retry budget for transient failures (DB blip, lock timeout). Source: plan §1.4.
TASK_MAX_RETRIES: int = 3


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def expire_campaign_vouchers(self) -> int:
    """Expire overdue ACTIVE vouchers (hourly). Returns the count expired."""
    from apps.campaigns.services import CampaignRewardService

    return CampaignRewardService.expire_vouchers()


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def expire_old_groups(self) -> int:
    """Expire FORMING/FULL groups past their check-in window (hourly).

    Replaces the deleted ``apps.qr.tasks.expire_old_groups`` /
    ``groups.services.expire_old_groups``. Returns the count expired.
    """
    from apps.campaigns.services import CampaignGroupService

    return CampaignGroupService.expire_old_groups()


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def transition_campaign_lifecycle(self) -> dict[str, int]:
    """Advance scheduled→active and active→ended by clock (every ~15 min).

    Returns a count of campaigns transitioned in each direction.
    """
    from apps.campaigns.services import CampaignService

    return CampaignService.run_lifecycle_transitions()


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def sweep_campaign_fraud(self) -> int:
    """Run the periodic fraud sweep (plan §15). Returns the number flagged."""
    from apps.campaigns.services import FraudService

    return FraudService.sweep()


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def notify_visit_counted(self, customer_id: str, campaign_id: str) -> dict[str, str]:
    """Notify a customer their visit was counted. Scheduled via on_commit.

    Idempotent in effect: re-running re-sends the same advisory message, which is
    harmless. Routes through ``notify_campaign_event`` so the customer's
    ``campaign_updates`` preference is honoured.
    """
    from apps.accounts.models import User
    from apps.campaigns.models import Campaign
    from apps.notifications.services import notifier

    customer = User.objects.get(id=customer_id)
    campaign = Campaign.objects.get(id=campaign_id)
    log = notifier.notify_campaign_event(
        customer,
        "campaign_visit_counted",
        {"campaign_id": str(campaign.id), "campaign_name": campaign.name},
    )
    return {"log_id": str(log.id)}


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def notify_reward_unlocked(self, customer_id: str, voucher_id: str) -> dict[str, str]:
    """Notify a customer a campaign reward unlocked. Scheduled via on_commit.

    Routes through ``notify_campaign_event`` so the customer's ``campaign_updates``
    preference is honoured.
    """
    from apps.accounts.models import User
    from apps.campaigns.models import CampaignRewardVoucher
    from apps.notifications.services import notifier

    customer = User.objects.get(id=customer_id)
    voucher = CampaignRewardVoucher.objects.select_related("reward").get(id=voucher_id)
    log = notifier.notify_campaign_event(
        customer,
        "campaign_reward_unlocked",
        {"voucher_id": str(voucher.id), "code": voucher.voucher_code},
    )
    return {"log_id": str(log.id)}


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def notify_vouchers_expiring_soon(self) -> int:
    """Warn customers whose ACTIVE vouchers expire within the warning window.

    Idempotent across a window: a voucher is notified at most once because the
    service marks it (``expiry_warned_at``) when the nudge is scheduled, so a
    re-run inside the window picks up nothing already warned. Fans out one
    ``notify_voucher_expiring`` task per due voucher. Returns the count scheduled.
    Called by the periodic ``notify-vouchers-expiring-soon`` beat entry.
    """
    from apps.campaigns.services import CampaignRewardService

    voucher_ids = CampaignRewardService.claim_vouchers_to_warn()
    for voucher_id in voucher_ids:
        notify_voucher_expiring.delay(voucher_id)
    return len(voucher_ids)


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def notify_voucher_expiring(self, voucher_id: str) -> dict[str, str]:
    """Notify a customer one campaign voucher is about to expire (per-voucher fan-out)."""
    from apps.campaigns.models import CampaignRewardVoucher
    from apps.notifications.services import notifier

    voucher = CampaignRewardVoucher.objects.select_related("customer", "reward").get(
        id=voucher_id
    )
    log = notifier.notify_campaign_event(
        voucher.customer,
        "campaign_voucher_expiring",
        {
            "voucher_id": str(voucher.id),
            "code": voucher.voucher_code,
            "expires_at": voucher.expires_at.isoformat()
            if voucher.expires_at
            else None,
        },
    )
    return {"log_id": str(log.id)}


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def notify_campaigns_ending_soon(self) -> int:
    """Warn participants of ACTIVE campaigns whose ``end_at`` is near.

    Idempotent across a window: a campaign is notified at most once because the
    service stamps it (``ending_warned_at``) when its nudge is scheduled. Fans out
    one ``notify_campaign_ending`` task per due campaign. Returns the count
    scheduled. Called by the periodic ``notify-campaigns-ending-soon`` beat entry.
    """
    from apps.campaigns.services import CampaignService

    campaign_ids = CampaignService.claim_campaigns_to_warn_ending()
    for campaign_id in campaign_ids:
        notify_campaign_ending.delay(campaign_id)
    return len(campaign_ids)


@shared_task(
    bind=True,
    max_retries=TASK_MAX_RETRIES,
    retry_backoff=True,
    time_limit=TASK_TIME_LIMIT_SECONDS,
)
def notify_campaign_ending(self, campaign_id: str) -> dict[str, int]:
    """Notify a campaign's not-yet-completed participants that it is ending soon.

    Sends one ``campaign_ending`` message per JOINED/IN_PROGRESS participant
    (completed/redeemed customers already have their reward and need no nudge).
    Returns the number of recipients messaged.
    """
    from apps.campaigns.models import Campaign, CampaignParticipant
    from apps.notifications.services import notifier

    campaign = Campaign.objects.get(id=campaign_id)
    participants = CampaignParticipant.objects.filter(
        campaign=campaign,
        status__in=[
            CampaignParticipant.Status.JOINED,
            CampaignParticipant.Status.IN_PROGRESS,
        ],
    ).select_related("customer")
    sent = 0
    for participant in participants:
        notifier.notify_campaign_event(
            participant.customer,
            "campaign_ending",
            {"campaign_id": str(campaign.id), "campaign_name": campaign.name},
        )
        sent += 1
    return {"recipients": sent}
