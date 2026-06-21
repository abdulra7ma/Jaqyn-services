from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.db.models.functions import TruncDate

from apps.businesses.models import Business
from apps.groups.models import GroupDeal, GroupMember, GroupOffer
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption, RewardTransaction
from apps.qr.models import QRCodeToken, ScanLog
from apps.reporting.models import AdminAuditLog


def mask_phone(phone):
    if not phone or len(phone) < 7:
        return phone
    return f"{phone[:6]}***{phone[-3:]}"


def business_metrics(business):
    scans = ScanLog.objects.filter(business=business)
    customer_scan_days = (
        scans.exclude(customer__isnull=True)
        .annotate(day=TruncDate("created_at"))
        .values("customer")
        .annotate(days=Count("day", distinct=True))
    )
    returning_customers = sum(1 for row in customer_scan_days if row["days"] >= 2)
    total_customers = scans.exclude(customer__isnull=True).values("customer").distinct().count()
    new_customers = max(total_customers - returning_customers, 0)
    active_groups = GroupDeal.objects.filter(group_offer__business=business).exclude(status__in=[GroupDeal.Status.COMPLETED, GroupDeal.Status.CANCELLED, GroupDeal.Status.EXPIRED, GroupDeal.Status.FAILED]).count()
    completed_groups = GroupDeal.objects.filter(group_offer__business=business, status=GroupDeal.Status.COMPLETED).count()
    total_groups = GroupDeal.objects.filter(group_offer__business=business).count()
    return {
        "total_scans": scans.count(),
        "new_customers": new_customers,
        "returning_customers": returning_customers,
        "rewards_issued": RewardRedemption.objects.filter(business=business).count(),
        "rewards_redeemed": RewardRedemption.objects.filter(business=business, status=RewardRedemption.Status.REDEEMED).count(),
        "active_groups": active_groups,
        "completed_groups": completed_groups,
        "group_completion_rate": completed_groups / total_groups if total_groups else 0,
        "customers_from_group_deals": GroupMember.objects.filter(group_deal__group_offer__business=business).values("customer").distinct().count(),
        "estimated_revenue": "0.00",
    }


def business_customers(business):
    user_ids = set()
    user_ids.update(ScanLog.objects.filter(business=business, customer__isnull=False).values_list("customer_id", flat=True))
    user_ids.update(RewardTransaction.objects.filter(business=business).values_list("customer_id", flat=True))
    user_ids.update(GroupMember.objects.filter(group_deal__group_offer__business=business).values_list("customer_id", flat=True))
    users = get_user_model().objects.filter(id__in=user_ids).order_by("-created_at")
    return [{"id": str(user.id), "phone": mask_phone(user.phone), "name": user.name} for user in users]


def admin_metrics():
    User = get_user_model()
    suspicious = ScanLog.objects.filter(status__in=[ScanLog.Status.FAILED, ScanLog.Status.BLOCKED]).values("customer", "business").annotate(total=Count("id")).filter(total__gte=3).count()
    return {
        "total_businesses": Business.objects.count(),
        "active_businesses": Business.objects.filter(status=Business.Status.APPROVED).count(),
        "total_customers": User.objects.filter(role="customer").count(),
        "total_scans": ScanLog.objects.count(),
        "total_redemptions": RewardRedemption.objects.count(),
        "suspicious_scans": suspicious,
        "active_offers": GroupOffer.objects.filter(status=GroupOffer.Status.ACTIVE).count(),
        "completed_groups": GroupDeal.objects.filter(status=GroupDeal.Status.COMPLETED).count(),
    }


def audit(admin, action, target, reason=None, metadata=None):
    return AdminAuditLog.objects.create(
        admin=admin,
        action=action,
        target_type=target.__class__.__name__,
        target_id=str(target.id),
        reason=reason,
        metadata=metadata or {},
    )


def disable_business_and_tokens(business, admin=None, reason=None):
    business.status = Business.Status.DISABLED
    business.save(update_fields=["status", "updated_at"])
    QRCodeToken.objects.filter(business=business, is_active=True).update(is_active=False)
    audit(admin, "disable_business", business, reason)
    return business


def block_user(user, admin=None, reason=None):
    user.is_active = False
    user.save(update_fields=["is_active", "updated_at"])
    audit(admin, "block_user", user, reason)
    return user


def disable_qr_token(token, admin=None, reason=None):
    token.is_active = False
    token.save(update_fields=["is_active"])
    audit(admin, "disable_qr_token", token, reason)
    return token


def mark_group_failed(group, admin=None, reason=None):
    group.status = GroupDeal.Status.FAILED
    group.save(update_fields=["status", "updated_at"])
    audit(admin, "mark_group_failed", group, reason)
    return group


def mark_group_completed(group, admin=None, reason=None):
    group.status = GroupDeal.Status.COMPLETED
    group.save(update_fields=["status", "updated_at"])
    audit(admin, "mark_group_completed", group, reason)
    return group


def manual_adjustment(admin, customer, program, amount_count, reason):
    progress, _ = CustomerRewardProgress.objects.get_or_create(
        customer=customer,
        business=program.business,
        reward_program=program,
        defaults={"target_count": program.required_count or 1},
    )
    progress.current_count = max(progress.current_count + amount_count, 0)
    progress.save(update_fields=["current_count", "updated_at"])
    transaction = RewardTransaction.objects.create(
        customer=customer,
        business=program.business,
        reward_program=program,
        progress=progress,
        action=RewardTransaction.Action.ADJUSTED,
        amount_count=amount_count,
        source=RewardTransaction.Source.ADMIN_ADJUSTMENT,
        metadata={"reason": reason, "admin": str(admin.id) if admin else None},
    )
    audit(admin, "manual_adjustment", progress, reason, {"transaction": str(transaction.id)})
    return progress, transaction


def suspicious_scan_rows():
    return (
        ScanLog.objects.filter(status__in=[ScanLog.Status.FAILED, ScanLog.Status.BLOCKED])
        .values("customer", "business", "failure_reason")
        .annotate(total=Count("id"))
        .filter(total__gte=3)
        .order_by("-total")
    )
