from celery import shared_task

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.groups.models import GroupDeal
from apps.loyalty.models import RewardRedemption
from apps.notifications.services import notifier
from apps.reporting.services import business_metrics

@shared_task
def send_group_full_notification(group_id):
    group = GroupDeal.objects.get(id=group_id)
    logs = []
    for member in group.members.select_related("customer"):
        logs.append(notifier.send(member.customer, "sms", "group_full", {"group_id": str(group.id)}).id)
    notifier.send(group.group_offer.business.owner, "email", "business_group_full", {"group_id": str(group.id)})
    return {"group_id": group_id, "logs": [str(log_id) for log_id in logs]}


@shared_task
def send_visit_reminder(group_id):
    group = GroupDeal.objects.get(id=group_id)
    logs = [notifier.send(member.customer, "sms", "visit_reminder", {"group_id": str(group.id)}).id for member in group.members.select_related("customer")]
    return {"group_id": group_id, "logs": [str(log_id) for log_id in logs]}


@shared_task
def send_reward_unlocked(customer_id, reward_id):
    customer = User.objects.get(id=customer_id)
    redemption = RewardRedemption.objects.get(id=reward_id)
    log = notifier.send(customer, "sms", "reward_unlocked", {"redemption_id": str(redemption.id), "code": redemption.code})
    return {"log_id": str(log.id)}


@shared_task
def send_business_weekly_report(business_id):
    business = Business.objects.get(id=business_id)
    log = notifier.send(business.owner, "email", "business_weekly_report", {"business_id": str(business.id), "metrics": business_metrics(business)})
    return {"log_id": str(log.id)}
