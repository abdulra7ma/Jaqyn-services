from datetime import time

from django.db import models

from core.fields import TimeStampedModel


class Campaign(TimeStampedModel):
    class CampaignType(models.TextChoices):
        # One unified offer model with a type discriminator. INDIVIDUAL absorbs the
        # legacy loyalty programs (visit/stamp/spend); GROUP is the friends-together
        # offer; SOCIAL is the Instagram follow/tag bonus. Source:
        # 2026-06-26 campaigns-restructure design §3.
        INDIVIDUAL = "individual", "Individual"
        GROUP = "group", "Group"
        SOCIAL = "social", "Social"

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
    # Instagram handle the customer must follow/tag for a SOCIAL campaign. Nullable
    # because only SOCIAL campaigns set it. Source: campaigns-restructure design §3
    # (Campaign.instagram_handle nullable; SOCIAL only).
    instagram_handle = models.CharField(max_length=255, blank=True, null=True)
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

    class Mechanic(models.TextChoices):
        # INDIVIDUAL sub-discriminator: how an individual campaign advances. VISIT
        # counts visits, STAMP counts stamps (honoring max_banked), SPEND
        # accumulates a money threshold. Source: campaigns-restructure design §3.
        VISIT = "visit", "Visit"
        STAMP = "stamp", "Stamp"
        SPEND = "spend", "Spend"

    campaign = models.OneToOneField(Campaign, on_delete=models.CASCADE, related_name="rule")
    rule_type = models.CharField(max_length=32, choices=RuleType.choices)
    # INDIVIDUAL mechanic. Nullable because GROUP/SOCIAL campaigns have no per-visit
    # mechanic. Source: campaigns-restructure design §3 (CampaignRule.mechanic).
    mechanic = models.CharField(max_length=32, choices=Mechanic.choices, blank=True, null=True)
    required_count = models.PositiveIntegerField(default=1)
    # SPEND-mechanic threshold (money the customer must spend to complete) and the
    # minimum per-action spend that counts. Decimal for exact money. Nullable —
    # only SPEND campaigns set them. Source: campaigns-restructure design §3.
    required_spend = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    min_spend = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    # STAMP-mechanic cap on concurrently-banked unredeemed reward cycles. Nullable
    # (unlimited) and only meaningful for STAMP. Source: campaigns-restructure
    # design §3 (CampaignRule.max_banked).
    max_banked = models.PositiveIntegerField(blank=True, null=True)
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
    # Accumulated spend toward a SPEND-mechanic INDIVIDUAL campaign. Decimal for
    # exact money; default 0. Untouched by VISIT/STAMP/GROUP/SOCIAL campaigns.
    # Source: campaigns-restructure design §3 (CampaignParticipant.current_spend).
    current_spend = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # Self-entered Instagram follower count at join for a SOCIAL campaign. Feeds the
    # analytics "reach" triplet (sum of follower_count). Nullable — only SOCIAL
    # participants set it. Source: campaigns-restructure design §3.
    follower_count = models.PositiveIntegerField(blank=True, null=True)
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
        # Staff-verified Instagram follow/tag proof for a SOCIAL campaign. Source:
        # campaigns-restructure design §3 (CampaignAction.action_type adds
        # SOCIAL_PROOF).
        SOCIAL_PROOF = "social_proof", "Social proof"
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


class Group(TimeStampedModel):
    # A customer-formed group inside a GROUP campaign. Merges the legacy
    # groups.GroupDeal + campaigns.GroupSession into one table keyed by campaign.
    # Source: campaigns-restructure design §3 (Group; was GroupSession).
    class Status(models.TextChoices):
        FORMING = "forming", "Forming"
        FULL = "full", "Full"
        CHECKING_IN = "checking_in", "Checking in"
        COMPLETED = "completed", "Completed"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    campaign = models.ForeignKey(Campaign, on_delete=models.PROTECT, related_name="groups")
    group_leader = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="led_groups")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.FORMING)
    required_size = models.PositiveIntegerField()
    invite_token = models.CharField(max_length=128, unique=True)
    # Leader-chosen visit slot for the group ("we'll come Friday 8pm"). Optional —
    # a group can form without a fixed time. Source: richer customer GROUP flow
    # (leader picks a visit time when creating the group).
    visit_time = models.DateTimeField(blank=True, null=True)
    # Optional leader-given group name surfaced to invited friends ("Birthday
    # dinner"). max_length 80 keeps it a short label, not free text. Source:
    # richer customer GROUP flow (name the group).
    name = models.CharField(max_length=80, blank=True, default="")
    # Optional note from the leader to invited friends ("meet at the door").
    # Source: richer customer GROUP flow (note to friends).
    note = models.TextField(blank=True, default="")
    expires_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["campaign", "status"]),
        ]

    def __str__(self):
        return f"Group {self.invite_token[:8]} ({self.status})"


class GroupMember(TimeStampedModel):
    # Merges legacy groups.GroupMember + campaigns.GroupSessionMember. Source:
    # campaigns-restructure design §3 (GroupMember; was GroupSessionMember).
    class Status(models.TextChoices):
        JOINED = "joined", "Joined"
        CHECKED_IN = "checked_in", "Checked in"
        LEFT = "left", "Left"
        NO_SHOW = "no_show", "No show"

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="members")
    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="group_memberships")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.JOINED)
    joined_at = models.DateTimeField(blank=True, null=True)
    checked_in_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["group", "customer"], name="unique_group_member"),
        ]

    def __str__(self):
        return f"{self.customer} in {self.group_id}"
