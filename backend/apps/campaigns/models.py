from datetime import time

from django.db import models

from core.fields import TimeStampedModel


class Campaign(TimeStampedModel):
    class CampaignType(models.TextChoices):
        VISIT = "visit", "Visit"
        TIME_WINDOW = "time_window", "Time window"
        GROUP = "group", "Group"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SCHEDULED = "scheduled", "Scheduled"
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        ENDED = "ended", "Ended"
        CANCELLED = "cancelled", "Cancelled"

    class CompletionLimit(models.TextChoices):
        ONCE = "once", "Once"
        REPEATABLE = "repeatable", "Repeatable"

    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT, related_name="campaigns")
    created_by = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, related_name="created_campaigns", blank=True, null=True)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to="campaigns/", blank=True, null=True)
    campaign_type = models.CharField(max_length=32, choices=CampaignType.choices)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    start_at = models.DateTimeField(blank=True, null=True)
    end_at = models.DateTimeField(blank=True, null=True)
    active_days = models.JSONField(default=list, blank=True)
    active_start_time = models.TimeField(default=time(0, 0))
    active_end_time = models.TimeField(default=time(23, 59))
    max_participants = models.PositiveIntegerField(blank=True, null=True)
    max_rewards = models.PositiveIntegerField(blank=True, null=True)
    completion_limit_per_customer = models.CharField(max_length=32, choices=CompletionLimit.choices, default=CompletionLimit.ONCE)
    auto_join_enabled = models.BooleanField(default=False)
    allow_multiple_campaign_counting = models.BooleanField(default=False)
    # Set when the "campaign ending soon" nudge has been scheduled, so the
    # periodic notify task warns each campaign at most once. Source: plan §1.4
    # (notify campaign ending) — idempotency marker, not a business field.
    ending_warned_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["business", "status"]),
            models.Index(fields=["status", "campaign_type"]),
            models.Index(fields=["status", "start_at", "end_at"]),
        ]

    def __str__(self):
        return self.name


class CampaignRule(TimeStampedModel):
    class RuleType(models.TextChoices):
        VISIT_COUNT = "visit_count", "Visit count"
        TIME_WINDOW = "time_window", "Time window"
        GROUP_CHECKIN = "group_checkin", "Group check-in"

    campaign = models.OneToOneField(Campaign, on_delete=models.CASCADE, related_name="rule")
    rule_type = models.CharField(max_length=32, choices=RuleType.choices)
    required_count = models.PositiveIntegerField(default=1)
    minimum_time_between_actions = models.DurationField(blank=True, null=True)
    max_count_per_day = models.PositiveIntegerField(blank=True, null=True)
    required_group_size = models.PositiveIntegerField(blank=True, null=True)
    group_checkin_window_minutes = models.PositiveIntegerField(blank=True, null=True)
    window_before_time = models.TimeField(blank=True, null=True)

    def __str__(self):
        return f"{self.rule_type} for {self.campaign.name}"


class CampaignReward(TimeStampedModel):
    class RewardType(models.TextChoices):
        FREE_ITEM = "free_item", "Free item"
        DISCOUNT = "discount", "Discount"
        UPGRADE = "upgrade", "Upgrade"
        CUSTOM = "custom", "Custom"

    class ReceiverType(models.TextChoices):
        LEADER = "leader", "Leader"
        EVERY_MEMBER = "every_member", "Every member"
        TABLE = "table", "Table"

    campaign = models.OneToOneField(Campaign, on_delete=models.CASCADE, related_name="reward")
    reward_type = models.CharField(max_length=32, choices=RewardType.choices, default=RewardType.FREE_ITEM)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    estimated_cost = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    expiry_days_after_unlock = models.PositiveIntegerField(blank=True, null=True)
    max_redemptions = models.PositiveIntegerField(blank=True, null=True)
    reward_receiver_type = models.CharField(max_length=32, choices=ReceiverType.choices, default=ReceiverType.LEADER)

    def __str__(self):
        return f"{self.title} ({self.campaign.name})"


class CampaignParticipant(TimeStampedModel):
    class Status(models.TextChoices):
        JOINED = "joined", "Joined"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"
        REDEEMED = "redeemed", "Redeemed"

    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name="participants")
    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="campaign_participations")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.JOINED)
    progress_count = models.PositiveIntegerField(default=0)
    # Completion cycle counter. For REPEATABLE campaigns the participant row is
    # re-used across cycles; this distinguishes one completion from the next and
    # backs the uniqueness story for repeatable progress. Source: plan §1.1.
    completion_cycle = models.PositiveIntegerField(default=0)
    joined_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    last_progress_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            # One participant row per (campaign, customer). For ONCE campaigns this
            # is the natural key; for REPEATABLE the same row is re-used and the
            # `completion_cycle` counter advances per completion. Source: plan §1.1.
            models.UniqueConstraint(fields=["campaign", "customer"], name="unique_campaign_participant"),
        ]
        indexes = [
            models.Index(fields=["campaign", "status"]),
            models.Index(fields=["customer", "status"]),
        ]

    def __str__(self):
        return f"{self.customer} in {self.campaign.name}"


class CampaignAction(TimeStampedModel):
    class ActionType(models.TextChoices):
        VISIT = "visit", "Visit"
        GROUP_CHECKIN = "group_checkin", "Group check-in"
        REFERRAL = "referral", "Referral"

    class VerificationMethod(models.TextChoices):
        STAFF_SCAN = "staff_scan", "Staff scan"
        STAFF_MANUAL = "staff_manual", "Staff manual"
        AUTO_JOIN = "auto_join", "Auto join"

    class Status(models.TextChoices):
        COUNTED = "counted", "Counted"
        REJECTED = "rejected", "Rejected"
        FLAGGED = "flagged", "Flagged"

    campaign = models.ForeignKey(Campaign, on_delete=models.PROTECT, related_name="actions")
    participant = models.ForeignKey(CampaignParticipant, on_delete=models.PROTECT, related_name="actions")
    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="campaign_actions")
    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT, related_name="campaign_actions")
    action_type = models.CharField(max_length=32, choices=ActionType.choices, default=ActionType.VISIT)
    verified_by_staff = models.ForeignKey("staff.StaffMember", on_delete=models.SET_NULL, related_name="campaign_actions", blank=True, null=True)
    verification_method = models.CharField(max_length=32, choices=VerificationMethod.choices, default=VerificationMethod.STAFF_SCAN)
    action_time = models.DateTimeField()
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.COUNTED)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["campaign", "customer", "action_time"]),
            models.Index(fields=["participant", "action_time"]),
            models.Index(fields=["verified_by_staff", "action_time"]),
        ]

    def __str__(self):
        return f"{self.action_type} {self.customer} {self.action_time:%Y-%m-%d}"


class CampaignRewardVoucher(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        REDEEMED = "redeemed", "Redeemed"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    campaign = models.ForeignKey(Campaign, on_delete=models.PROTECT, related_name="vouchers")
    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="campaign_vouchers")
    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT, related_name="campaign_vouchers")
    reward = models.ForeignKey(CampaignReward, on_delete=models.PROTECT, related_name="vouchers")
    participant = models.ForeignKey(CampaignParticipant, on_delete=models.PROTECT, related_name="vouchers", blank=True, null=True)
    voucher_code = models.CharField(max_length=32, unique=True)
    qr_token = models.ForeignKey("qr.QRCodeToken", on_delete=models.SET_NULL, related_name="campaign_vouchers", blank=True, null=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ACTIVE)
    issued_at = models.DateTimeField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    redeemed_at = models.DateTimeField(blank=True, null=True)
    redeemed_by_staff = models.ForeignKey("staff.StaffMember", on_delete=models.SET_NULL, related_name="redeemed_campaign_vouchers", blank=True, null=True)
    cancel_reason = models.TextField(blank=True, null=True)
    # Set when the "voucher expiring soon" nudge has been scheduled, so the
    # periodic notify task warns each voucher at most once. Source: plan §1.4
    # (notify expiring soon) — idempotency marker, not a business field.
    expiry_warned_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["campaign", "status"]),
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["status", "expires_at"]),
        ]

    def __str__(self):
        return f"{self.voucher_code} ({self.status})"


class GroupSession(TimeStampedModel):
    class Status(models.TextChoices):
        FORMING = "forming", "Forming"
        FULL = "full", "Full"
        CHECKING_IN = "checking_in", "Checking in"
        COMPLETED = "completed", "Completed"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    campaign = models.ForeignKey(Campaign, on_delete=models.PROTECT, related_name="group_sessions")
    group_leader = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="led_group_sessions")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.FORMING)
    required_size = models.PositiveIntegerField()
    invite_token = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["campaign", "status"]),
        ]

    def __str__(self):
        return f"Group {self.invite_token[:8]} ({self.status})"


class GroupSessionMember(TimeStampedModel):
    class Status(models.TextChoices):
        JOINED = "joined", "Joined"
        CHECKED_IN = "checked_in", "Checked in"
        LEFT = "left", "Left"
        NO_SHOW = "no_show", "No show"

    group_session = models.ForeignKey(GroupSession, on_delete=models.CASCADE, related_name="members")
    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="group_session_memberships")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.JOINED)
    joined_at = models.DateTimeField(blank=True, null=True)
    checked_in_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["group_session", "customer"], name="unique_group_session_member"),
        ]

    def __str__(self):
        return f"{self.customer} in {self.group_session_id}"
