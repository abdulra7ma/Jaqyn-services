from django.db import models

from core.fields import TimeStampedModel, UUIDModel


class RewardProgram(TimeStampedModel):
    class Type(models.TextChoices):
        STAMP = "stamp", "Stamp"
        VISIT = "visit", "Visit"
        SPEND = "spend", "Spend"
        COUPON = "coupon", "Coupon"
        WELCOME = "welcome", "Welcome"
        BIRTHDAY = "birthday", "Birthday"

    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT, related_name="reward_programs")
    type = models.CharField(max_length=32, choices=Type.choices)
    title = models.CharField(max_length=255)
    description = models.TextField()
    required_count = models.PositiveIntegerField(blank=True, null=True)
    required_spend = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    reward_description = models.TextField()
    minimum_spend = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    expiry_days = models.PositiveIntegerField(blank=True, null=True)
    max_redemptions_per_customer = models.PositiveIntegerField(blank=True, null=True)
    max_banked = models.PositiveIntegerField(blank=True, null=True)
    terms = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)


class CustomerRewardProgress(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        UNLOCKED = "unlocked", "Unlocked"
        REDEEMED = "redeemed", "Redeemed"
        EXPIRED = "expired", "Expired"

    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="reward_progress")
    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT, related_name="reward_progress")
    reward_program = models.ForeignKey(RewardProgram, on_delete=models.PROTECT, related_name="progress")
    current_count = models.PositiveIntegerField(default=0)
    current_spend = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    target_count = models.PositiveIntegerField(blank=True, null=True)
    completed_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ACTIVE)
    unlocked_at = models.DateTimeField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["customer", "business", "reward_program"], name="unique_customer_reward_progress")
        ]


class RewardTransaction(UUIDModel):
    class Action(models.TextChoices):
        EARNED = "earned", "Earned"
        ADJUSTED = "adjusted", "Adjusted"
        REVERSED = "reversed", "Reversed"
        UNLOCKED = "unlocked", "Unlocked"

    class Source(models.TextChoices):
        QR_SCAN = "qr_scan", "QR scan"
        STAFF_MANUAL = "staff_manual", "Staff manual"
        ADMIN_ADJUSTMENT = "admin_adjustment", "Admin adjustment"
        GROUP_DEAL = "group_deal", "Group deal"

    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="reward_transactions")
    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT, related_name="reward_transactions")
    reward_program = models.ForeignKey(RewardProgram, on_delete=models.PROTECT, related_name="transactions")
    progress = models.ForeignKey(CustomerRewardProgress, on_delete=models.PROTECT, related_name="transactions")
    action = models.CharField(max_length=32, choices=Action.choices)
    amount_count = models.IntegerField(default=1)
    amount_spend = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    source = models.CharField(max_length=32, choices=Source.choices)
    staff = models.ForeignKey("staff.StaffMember", on_delete=models.PROTECT, related_name="reward_transactions", blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class RewardRedemption(UUIDModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        REDEEMED = "redeemed", "Redeemed"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="reward_redemptions")
    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT, related_name="reward_redemptions")
    reward_program = models.ForeignKey(RewardProgram, on_delete=models.PROTECT, related_name="redemptions")
    progress = models.ForeignKey(CustomerRewardProgress, on_delete=models.PROTECT, related_name="redemptions", null=True, blank=True)
    code = models.CharField(max_length=32, unique=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    redeemed_by = models.ForeignKey("staff.StaffMember", on_delete=models.PROTECT, related_name="redemptions", blank=True, null=True)
    redeemed_at = models.DateTimeField(blank=True, null=True)
    presented_at = models.DateTimeField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
