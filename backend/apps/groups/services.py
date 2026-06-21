import secrets
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status

from apps.businesses.models import Business
from apps.groups.models import GroupDeal, GroupMember, GroupOffer
from apps.notifications.tasks import send_group_full_notification
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import create_token, validate_approval_code
from apps.staff.models import StaffMember
from apps.system.models import SystemConfiguration
from core.exceptions import JaqynAPIException
from core.logging import emit_event, log_scan

# Deal statuses that count as "active" toward a customer's concurrent-group limit.
ACTIVE_DEAL_STATUSES = (
    GroupDeal.Status.FORMING,
    GroupDeal.Status.FULL,
    GroupDeal.Status.SCHEDULED,
    GroupDeal.Status.CHECKING_IN,
)


def count_active_groups(customer) -> int:
    """How many still-active group deals the customer currently belongs to."""
    return (
        GroupDeal.objects.filter(
            members__customer=customer,
            members__status__in=[GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN],
            status__in=ACTIVE_DEAL_STATUSES,
        )
        .distinct()
        .count()
    )


def ensure_under_active_group_limit(customer):
    """Enforce the admin-configurable cap on concurrent active groups per customer."""
    limit = SystemConfiguration.load().max_active_groups_per_user
    if count_active_groups(customer) >= limit:
        raise JaqynAPIException(
            "MAX_ACTIVE_GROUPS",
            f"You can be in at most {limit} active group{'s' if limit != 1 else ''} at the same time.",
            status_code=status.HTTP_409_CONFLICT,
        )


def ensure_approved_business(business):
    if business.status != Business.Status.APPROVED:
        raise JaqynAPIException("BUSINESS_NOT_ACTIVE", status_code=status.HTTP_400_BAD_REQUEST)


def create_group_offer(business, data):
    ensure_approved_business(business)
    offer = GroupOffer.objects.create(business=business, **data)
    emit_event("group_offer_created", business_id=str(business.id), group_offer_id=str(offer.id))
    return offer


def submit_group_offer(offer):
    if offer.status not in {GroupOffer.Status.DRAFT, GroupOffer.Status.REJECTED}:
        raise JaqynAPIException("VALIDATION_ERROR", "Only draft or rejected offers can be submitted", status.HTTP_409_CONFLICT)
    offer.status = GroupOffer.Status.PENDING_APPROVAL
    offer.save(update_fields=["status", "updated_at"])
    return offer


def approve_group_offer(offer, admin_user=None):
    if offer.status != GroupOffer.Status.PENDING_APPROVAL:
        raise JaqynAPIException("VALIDATION_ERROR", "Only pending offers can be approved", status.HTTP_409_CONFLICT)
    offer.status = GroupOffer.Status.ACTIVE
    offer.save(update_fields=["status", "updated_at"])
    emit_event("group_offer_approved", group_offer_id=str(offer.id), admin_id=str(getattr(admin_user, "id", "")))
    return offer


def reject_group_offer(offer, admin_user=None):
    if offer.status != GroupOffer.Status.PENDING_APPROVAL:
        raise JaqynAPIException("VALIDATION_ERROR", "Only pending offers can be rejected", status.HTTP_409_CONFLICT)
    offer.status = GroupOffer.Status.REJECTED
    offer.save(update_fields=["status", "updated_at"])
    emit_event("admin_rejected_group_offer", group_offer_id=str(offer.id), admin_id=str(getattr(admin_user, "id", "")))
    return offer


def pause_group_offer(offer):
    if offer.status != GroupOffer.Status.ACTIVE:
        raise JaqynAPIException("VALIDATION_ERROR", "Only active offers can be paused", status.HTTP_409_CONFLICT)
    offer.status = GroupOffer.Status.PAUSED
    offer.save(update_fields=["status", "updated_at"])
    emit_event("group_offer_paused", group_offer_id=str(offer.id))
    return offer


def activate_group_offer(offer):
    if offer.status != GroupOffer.Status.PAUSED:
        raise JaqynAPIException("VALIDATION_ERROR", "Only paused offers can be activated", status.HTTP_409_CONFLICT)
    offer.status = GroupOffer.Status.ACTIVE
    offer.save(update_fields=["status", "updated_at"])
    return offer


def active_public_offers():
    today = timezone.localdate()
    return GroupOffer.objects.filter(status=GroupOffer.Status.ACTIVE, valid_from__lte=today, valid_to__gte=today).select_related("business")


def ensure_offer_active(offer):
    today = timezone.localdate()
    if offer.status != GroupOffer.Status.ACTIVE or offer.valid_from > today or offer.valid_to < today:
        raise JaqynAPIException("GROUP_NOT_ACTIVE", status_code=status.HTTP_400_BAD_REQUEST)


def weekday_key(value):
    return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][value.weekday()]


def validate_visit_time(offer, visit_time):
    ensure_offer_active(offer)
    local_visit = timezone.localtime(visit_time)
    if weekday_key(local_visit.date()) not in offer.valid_days:
        raise JaqynAPIException("GROUP_NOT_ACTIVE", "Visit day is not valid for this offer", status.HTTP_400_BAD_REQUEST)
    if not (offer.time_start <= local_visit.time() <= offer.time_end):
        raise JaqynAPIException("GROUP_NOT_ACTIVE", "Visit time is outside offer hours", status.HTTP_400_BAD_REQUEST)
    if offer.max_groups_per_day is not None:
        start = local_visit.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        count = GroupDeal.objects.filter(group_offer=offer, visit_time__gte=start, visit_time__lt=end).exclude(status__in=[GroupDeal.Status.CANCELLED, GroupDeal.Status.FAILED]).count()
        if count >= offer.max_groups_per_day:
            raise JaqynAPIException("GROUP_NOT_ACTIVE", "Daily group cap reached", status.HTTP_400_BAD_REQUEST)


def invite_token():
    return secrets.token_urlsafe(24)


def group_reward_code():
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8].upper()


@transaction.atomic
def create_group_deal(customer, offer, visit_time):
    validate_visit_time(offer, visit_time)
    ensure_under_active_group_limit(customer)
    token = invite_token()
    while GroupDeal.objects.filter(invite_token=token).exists():
        token = invite_token()
    deal = GroupDeal.objects.create(group_offer=offer, leader=customer, visit_time=visit_time, invite_token=token)
    GroupMember.objects.create(group_deal=deal, customer=customer)
    create_token(QRCodeToken.Type.GROUP_INVITE, business=offer.business, customer=customer, group_deal=deal)
    emit_event("group_created", group_deal_id=str(deal.id), customer_id=str(customer.id), group_offer_id=str(offer.id))
    return deal


def active_member_count(deal):
    return deal.members.filter(status__in=[GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN]).count()


@transaction.atomic
def join_group_deal(customer, deal):
    deal = GroupDeal.objects.select_for_update().select_related("group_offer").get(id=deal.id)
    ensure_offer_active(deal.group_offer)
    if deal.status not in {GroupDeal.Status.FORMING, GroupDeal.Status.FULL, GroupDeal.Status.SCHEDULED}:
        raise JaqynAPIException("GROUP_NOT_ACTIVE", status_code=status.HTTP_400_BAD_REQUEST)
    if deal.group_offer.max_group_size and active_member_count(deal) >= deal.group_offer.max_group_size:
        raise JaqynAPIException("GROUP_FULL", status_code=status.HTTP_409_CONFLICT)
    if not deal.members.filter(
        customer=customer, status__in=[GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN]
    ).exists():
        ensure_under_active_group_limit(customer)
    try:
        member, created = GroupMember.objects.get_or_create(group_deal=deal, customer=customer, defaults={"status": GroupMember.Status.JOINED})
    except IntegrityError:
        raise JaqynAPIException("VALIDATION_ERROR", "Already joined", status.HTTP_409_CONFLICT)
    if not created and member.status in {GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN}:
        raise JaqynAPIException("VALIDATION_ERROR", "Already joined", status.HTTP_409_CONFLICT)
    if not created:
        member.status = GroupMember.Status.JOINED
        member.save(update_fields=["status", "updated_at"])

    count = active_member_count(deal)
    if count >= deal.group_offer.min_group_size:
        deal.status = GroupDeal.Status.SCHEDULED
        deal.save(update_fields=["status", "updated_at"])
        send_group_full_notification.delay(str(deal.id))
    emit_event("group_joined", group_deal_id=str(deal.id), customer_id=str(customer.id))
    return deal


def leave_group_deal(customer, deal):
    member = deal.members.filter(customer=customer).first()
    if member is None or member.status not in {GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN}:
        raise JaqynAPIException("NOT_GROUP_MEMBER", status_code=status.HTTP_403_FORBIDDEN)
    if deal.leader_id == customer.id:
        raise JaqynAPIException("PERMISSION_DENIED", "Leader must cancel the group", status.HTTP_403_FORBIDDEN)
    member.status = GroupMember.Status.LEFT
    member.save(update_fields=["status", "updated_at"])
    return deal


def cancel_group_deal(customer, deal):
    if deal.leader_id != customer.id:
        raise JaqynAPIException("PERMISSION_DENIED", status_code=status.HTTP_403_FORBIDDEN)
    if deal.status in {GroupDeal.Status.COMPLETED, GroupDeal.Status.CANCELLED}:
        raise JaqynAPIException("GROUP_NOT_ACTIVE", status_code=status.HTTP_409_CONFLICT)
    deal.status = GroupDeal.Status.CANCELLED
    deal.save(update_fields=["status", "updated_at"])
    return deal


def checkin_window_open(deal):
    now = timezone.now()
    window = timedelta(minutes=deal.group_offer.checkin_window_minutes)
    return deal.visit_time - window <= now <= deal.visit_time + window


@transaction.atomic
def check_in_group_member(customer, deal, approval_code=None, request=None):
    deal = GroupDeal.objects.select_for_update().select_related("group_offer", "group_offer__business").get(id=deal.id)
    ensure_offer_active(deal.group_offer)
    if not checkin_window_open(deal):
        raise JaqynAPIException("GROUP_CHECKIN_CLOSED", status_code=status.HTTP_400_BAD_REQUEST)
    member = deal.members.select_for_update().filter(customer=customer).first()
    if member is None or member.status not in {GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN}:
        raise JaqynAPIException("NOT_GROUP_MEMBER", status_code=status.HTTP_403_FORBIDDEN)
    if deal.group_offer.requires_staff_code:
        validate_approval_code(deal.group_offer.business, approval_code, customer, request)
    if member.status != GroupMember.Status.CHECKED_IN:
        member.status = GroupMember.Status.CHECKED_IN
        member.checked_in_at = timezone.now()
        member.save(update_fields=["status", "checked_in_at", "updated_at"])
        emit_event("group_checked_in", group_deal_id=str(deal.id), customer_id=str(customer.id))

    checked_in_count = deal.members.filter(status=GroupMember.Status.CHECKED_IN).count()
    if checked_in_count >= deal.group_offer.min_group_size and not deal.reward_code:
        deal.status = GroupDeal.Status.COMPLETED
        deal.completed_at = timezone.now()
        code = group_reward_code()
        while GroupDeal.objects.filter(reward_code=code).exists():
            code = group_reward_code()
        deal.reward_code = code
        deal.save(update_fields=["status", "completed_at", "reward_code", "updated_at"])
        create_token(QRCodeToken.Type.GROUP_REWARD, business=deal.group_offer.business, group_deal=deal)
        emit_event("group_completed", group_deal_id=str(deal.id))
    elif deal.status in {GroupDeal.Status.FORMING, GroupDeal.Status.SCHEDULED}:
        deal.status = GroupDeal.Status.CHECKING_IN
        deal.save(update_fields=["status", "updated_at"])
    return deal


@transaction.atomic
def redeem_group_reward(staff, deal):
    deal = GroupDeal.objects.select_for_update().select_related("group_offer", "group_offer__business").get(id=deal.id)
    if deal.group_offer.business_id != staff.business_id:
        log_scan(staff=staff, business=staff.business, action="group_redeem", status=ScanLog.Status.BLOCKED, failure_reason="WRONG_BUSINESS")
        raise JaqynAPIException("WRONG_BUSINESS", status_code=status.HTTP_403_FORBIDDEN)
    if deal.redeemed_at:
        log_scan(staff=staff, business=staff.business, action="group_redeem", status=ScanLog.Status.BLOCKED, failure_reason="REWARD_ALREADY_REDEEMED")
        raise JaqynAPIException("REWARD_ALREADY_REDEEMED", status_code=status.HTTP_409_CONFLICT)
    if deal.members.filter(status=GroupMember.Status.CHECKED_IN).count() < deal.group_offer.min_group_size:
        log_scan(staff=staff, business=staff.business, action="group_redeem", status=ScanLog.Status.BLOCKED, failure_reason="GROUP_NOT_COMPLETE")
        raise JaqynAPIException("GROUP_NOT_COMPLETE", status_code=status.HTTP_409_CONFLICT)
    deal.status = GroupDeal.Status.COMPLETED
    deal.redeemed_at = timezone.now()
    deal.save(update_fields=["status", "redeemed_at", "updated_at"])
    log_scan(staff=staff, business=staff.business, action="group_redeem", status=ScanLog.Status.SUCCESS)
    emit_event("staff_redeemed_reward", business_id=str(staff.business_id), staff_id=str(staff.id), group_deal_id=str(deal.id))
    return deal


def expire_old_groups():
    now = timezone.now()
    return GroupDeal.objects.filter(visit_time__lt=now - timedelta(hours=2), status__in=[GroupDeal.Status.FORMING, GroupDeal.Status.SCHEDULED, GroupDeal.Status.CHECKING_IN]).update(status=GroupDeal.Status.EXPIRED, updated_at=now)
