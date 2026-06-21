from datetime import date, time

from django.db import models

from core.fields import TimeStampedModel


class GroupOffer(TimeStampedModel):
    class RewardType(models.TextChoices):
        FREE_SHARED_ITEM = "free_shared_item", "Free shared item"
        GROUP_DISCOUNT = "group_discount", "Group discount"
        LEADER_REWARD = "leader_reward", "Leader reward"
        BUY_X_GET_Y = "buy_x_get_y", "Buy X get Y"
        FRIEND_BOOKING = "friend_booking", "Friend booking"
        CUSTOM = "custom", "Custom"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_APPROVAL = "pending_approval", "Pending approval"
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        EXPIRED = "expired", "Expired"
        REJECTED = "rejected", "Rejected"

    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT, related_name="group_offers")
    title = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=64)
    min_group_size = models.PositiveIntegerField()
    max_group_size = models.PositiveIntegerField(blank=True, null=True)
    min_paid_customers = models.PositiveIntegerField(blank=True, null=True)
    min_spend_per_person = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    reward_type = models.CharField(max_length=32, choices=RewardType.choices, default=RewardType.CUSTOM)
    reward_description = models.TextField()
    valid_from = models.DateField(default=date.today)
    valid_to = models.DateField(default=date.today)
    valid_days = models.JSONField(default=list)
    time_start = models.TimeField(default=time(9, 0))
    time_end = models.TimeField(default=time(21, 0))
    max_groups_per_day = models.PositiveIntegerField(blank=True, null=True)
    checkin_window_minutes = models.PositiveIntegerField(default=30)
    requires_staff_code = models.BooleanField(default=True)
    requires_staff_approval = models.BooleanField(default=True)
    terms = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)

    def __str__(self):
        return self.title


class GroupDeal(TimeStampedModel):
    class Status(models.TextChoices):
        FORMING = "forming", "Forming"
        FULL = "full", "Full"
        SCHEDULED = "scheduled", "Scheduled"
        CHECKING_IN = "checking_in", "Checking in"
        COMPLETED = "completed", "Completed"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"
        FAILED = "failed", "Failed"

    group_offer = models.ForeignKey(GroupOffer, on_delete=models.PROTECT, related_name="deals")
    leader = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="led_group_deals")
    visit_time = models.DateTimeField()
    invite_token = models.CharField(max_length=128, unique=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.FORMING)
    reward_code = models.CharField(max_length=32, unique=True, blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    redeemed_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"{self.group_offer.title} at {self.visit_time}"


class GroupMember(TimeStampedModel):
    class Status(models.TextChoices):
        JOINED = "joined", "Joined"
        CHECKED_IN = "checked_in", "Checked in"
        LEFT = "left", "Left"
        NO_SHOW = "no_show", "No show"
        REMOVED = "removed", "Removed"

    group_deal = models.ForeignKey(GroupDeal, on_delete=models.CASCADE, related_name="members")
    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="group_memberships")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.JOINED)
    checked_in_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["group_deal", "customer"], name="unique_group_member")
        ]
