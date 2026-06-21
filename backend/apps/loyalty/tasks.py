from celery import shared_task


@shared_task
def expire_rewards():
    from apps.loyalty.services import expire_pending_rewards

    return expire_pending_rewards()


@shared_task
def send_reward_unlocked(customer_id, reward_id):
    from apps.notifications.tasks import send_reward_unlocked as notify_reward_unlocked

    return notify_reward_unlocked(customer_id, reward_id)
