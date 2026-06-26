from datetime import date, time

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.tasks import send_otp
from apps.businesses.models import Business
from apps.campaigns.models import Campaign, Group, GroupMember
from apps.notifications.models import NotificationLog, NotificationPreference
from apps.notifications.services import notifier
from apps.notifications.tasks import send_business_weekly_report, send_group_full_notification


pytestmark = pytest.mark.django_db


def make_business():
    owner = User.objects.create_user(phone="+996708000001", role=User.Role.BUSINESS_OWNER, is_phone_verified=True, email="owner@example.com")
    return Business.objects.create(
        owner=owner,
        name="Notify Cafe",
        category="cafe",
        address="Notify 1",
        area="center",
        phone="+996708000002",
        working_hours={},
        status=Business.Status.APPROVED,
    )


def make_group(business):
    customer = User.objects.create_user(phone="+996708900001", role=User.Role.CUSTOMER, is_phone_verified=True)
    campaign = Campaign.objects.create(
        business=business, name="Notify group", campaign_type=Campaign.CampaignType.GROUP,
        status=Campaign.Status.ACTIVE,
    )
    group = Group.objects.create(
        campaign=campaign, group_leader=customer, required_size=1,
        invite_token="notify-invite", status=Group.Status.FORMING,
    )
    GroupMember.objects.create(group=group, customer=customer)
    return group


def test_notification_preferences_endpoint(api_client):
    user = User.objects.create_user(phone="+996708000003", role=User.Role.CUSTOMER, is_phone_verified=True)
    api_client.force_authenticate(user)

    initial = api_client.get("/api/notifications/preferences/")
    updated = api_client.patch("/api/notifications/preferences/", {"sms_enabled": False, "group_reminders": False}, format="json")

    assert initial.status_code == 200
    assert initial.data["data"]["sms_enabled"] is True
    assert updated.data["data"]["sms_enabled"] is False
    assert updated.data["data"]["group_reminders"] is False


def test_campaign_updates_preference_round_trips(api_client):
    user = User.objects.create_user(phone="+996708000033", role=User.Role.CUSTOMER, is_phone_verified=True)
    api_client.force_authenticate(user)

    initial = api_client.get("/api/notifications/preferences/")
    updated = api_client.patch("/api/notifications/preferences/", {"campaign_updates": False}, format="json")

    assert initial.data["data"]["campaign_updates"] is True
    assert updated.data["data"]["campaign_updates"] is False


def test_notify_campaign_event_honours_campaign_updates_preference():
    user = User.objects.create_user(phone="+996708000034", role=User.Role.CUSTOMER, is_phone_verified=True)
    NotificationPreference.objects.create(user=user, campaign_updates=False)

    log = notifier.notify_campaign_event(user, "campaign_visit_counted", {"campaign_name": "Buy 5"})

    assert log.event == "campaign_visit_counted"
    assert log.channel == "sms"
    assert log.status == NotificationLog.Status.SKIPPED


def test_notify_campaign_event_sends_when_enabled():
    user = User.objects.create_user(phone="+996708000035", role=User.Role.CUSTOMER, is_phone_verified=True)

    log = notifier.notify_campaign_event(user, "campaign_ending", {"campaign_name": "Buy 5"})

    assert log.status == NotificationLog.Status.SENT
    assert log.event == "campaign_ending"


def test_otp_task_logs_dev_sms_notification():
    log_id = send_otp("+996708000004", "123456")

    log = NotificationLog.objects.get(id=log_id)
    assert log.event == "otp"
    assert log.channel == "sms"
    assert log.status == NotificationLog.Status.SENT


def test_group_full_and_weekly_report_tasks_create_logs(api_client):
    business = make_business()
    group = make_group(business)

    group_result = send_group_full_notification(str(group.id))
    report_result = send_business_weekly_report(str(business.id))

    assert NotificationLog.objects.filter(event="group_full", status=NotificationLog.Status.SENT).exists()
    assert NotificationLog.objects.filter(event="business_weekly_report").exists()
    assert group_result["logs"]
    assert report_result["log_id"]


def test_admin_notification_logs(api_client):
    admin = User.objects.create_superuser(phone="+996708000005", password="secret")
    NotificationLog.objects.create(channel="sms", event="otp", status=NotificationLog.Status.SENT)
    api_client.force_authenticate(admin)

    response = api_client.get("/api/admin/notification-logs/")

    assert response.status_code == 200
    assert response.data["data"]["results"][0]["event"] == "otp"
