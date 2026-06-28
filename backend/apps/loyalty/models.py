from django.db import models

from core.fields import TimeStampedModel, UUIDModel


class LoyaltyProgram(TimeStampedModel):
    class Type(models.TextChoices):
        # The three durable card forms are intentionally separate from time-bound campaigns.
        POINTS = "points", "Points"
        STAMP = "stamp", "Stamp"
        VISIT = "visit", "Visit"

    class Status(models.TextChoices):
        # Archived programs remain queryable for historical ledgers and vouchers.
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        ARCHIVED = "archived", "Archived"

    class PointsBasis(models.TextChoices):
        # A points program awards either a fixed visit amount or a rate per som spent.
        VISIT = "visit", "Per visit"
        SPEND = "spend", "Per spend"

    class RewardType(models.TextChoices):
        # Cashback belongs to points; the other rewards belong to stamp/visit cards.
        FREE_ITEM = "free_item", "Free item"
        DISCOUNT = "discount", "Discount"
        UPGRADE = "upgrade", "Upgrade"
        CASHBACK = "cashback", "Cashback"

    class ItemSelection(models.TextChoices):
        # Item rewards are either fixed at setup or chosen by the customer after earning.
        FIXED = "fixed", "Fixed item"
        CUSTOMER = "customer", "Customer chooses"

    business = models.ForeignKey(
        "businesses.Business", on_delete=models.PROTECT, related_name="loyalty_programs"
    )
    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL, blank=True, null=True
    )
    type = models.CharField(max_length=16, choices=Type.choices)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="loyalty/", blank=True, null=True)
    points_basis = models.CharField(
        max_length=16, choices=PointsBasis.choices, blank=True, null=True
    )
    points_per_visit = models.PositiveIntegerField(blank=True, null=True)
    points_per_som = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True
    )
    cashback_per_point = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True
    )
    min_redeem_points = models.PositiveIntegerField(blank=True, null=True)
    required_count = models.PositiveIntegerField(blank=True, null=True)
    max_banked = models.PositiveIntegerField(blank=True, null=True)
    reward_type = models.CharField(
        max_length=16, choices=RewardType.choices, blank=True, null=True
    )
    reward_title = models.CharField(max_length=160, blank=True)
    reward_description = models.TextField(blank=True)
    # Thirty days gives earned rewards a useful window while bounding liability.
    reward_expiry_days = models.PositiveIntegerField(default=30)
    item_selection = models.CharField(
        max_length=16, choices=ItemSelection.choices, blank=True, null=True
    )
    catalog_item = models.ForeignKey(
        "businesses.CatalogItem",
        on_delete=models.SET_NULL,
        related_name="+",
        blank=True,
        null=True,
    )
    active_days = models.JSONField(default=list, blank=True)
    active_start_time = models.TimeField(blank=True, null=True)
    active_end_time = models.TimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["business", "status"]),
            models.Index(fields=["status", "type"]),
        ]

    def __str__(self) -> str:
        return self.name


class LoyaltyMembership(TimeStampedModel):
    class Status(models.TextChoices):
        # Inactive cards preserve history without accepting new awards.
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"

    program = models.ForeignKey(
        LoyaltyProgram, on_delete=models.CASCADE, related_name="memberships"
    )
    customer = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="loyalty_memberships"
    )
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    stamps_count = models.PositiveIntegerField(default=0)
    visits_count = models.PositiveIntegerField(default=0)
    points_balance = models.PositiveIntegerField(default=0)
    current_spend = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cycle = models.PositiveIntegerField(default=0)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_activity_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["program", "customer"], name="uniq_loyalty_membership"
            )
        ]


class LoyaltyTransaction(UUIDModel):
    class Kind(models.TextChoices):
        # The immutable ledger distinguishes customer value earned, spent, corrected, or reversed.
        EARN = "earn", "Earn"
        REDEEM = "redeem", "Redeem"
        ADJUST = "adjust", "Adjust"
        REVERSE = "reverse", "Reverse"

    class Source(models.TextChoices):
        # Source supports audit filtering without overloading free-form metadata.
        STAFF_SCAN = "staff_scan", "Staff scan"
        ADMIN = "admin", "Admin"
        SYSTEM = "system", "System"

    membership = models.ForeignKey(
        LoyaltyMembership, on_delete=models.CASCADE, related_name="transactions"
    )
    program = models.ForeignKey(LoyaltyProgram, on_delete=models.PROTECT)
    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT)
    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    source = models.CharField(
        max_length=16, choices=Source.choices, default=Source.STAFF_SCAN
    )
    points_delta = models.IntegerField(blank=True, null=True)
    stamps_delta = models.IntegerField(blank=True, null=True)
    bill_amount = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True
    )
    staff = models.ForeignKey(
        "staff.StaffMember", on_delete=models.SET_NULL, blank=True, null=True
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)


class LoyaltyVoucher(UUIDModel):
    class Status(models.TextChoices):
        # Terminal states remain immutable evidence of voucher disposition.
        ACTIVE = "active", "Active"
        REDEEMED = "redeemed", "Redeemed"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    membership = models.ForeignKey(
        LoyaltyMembership, on_delete=models.CASCADE, related_name="vouchers"
    )
    program = models.ForeignKey(
        LoyaltyProgram, on_delete=models.PROTECT, related_name="vouchers"
    )
    customer = models.ForeignKey("accounts.User", on_delete=models.PROTECT)
    business = models.ForeignKey("businesses.Business", on_delete=models.PROTECT)
    voucher_code = models.CharField(max_length=32, unique=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.ACTIVE
    )
    reward_type = models.CharField(
        max_length=16, choices=LoyaltyProgram.RewardType.choices
    )
    reward_title = models.CharField(max_length=160, blank=True)
    cashback_amount = models.DecimalField(
        max_digits=12, decimal_places=2, blank=True, null=True
    )
    catalog_item = models.ForeignKey(
        "businesses.CatalogItem",
        on_delete=models.SET_NULL,
        related_name="+",
        blank=True,
        null=True,
    )
    qr_token = models.ForeignKey(
        "qr.QRCodeToken", on_delete=models.SET_NULL, blank=True, null=True
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    redeemed_at = models.DateTimeField(blank=True, null=True)
    redeemed_by_staff = models.ForeignKey(
        "staff.StaffMember", on_delete=models.SET_NULL, blank=True, null=True
    )
    expiry_warned_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=["customer", "status"]),
            models.Index(fields=["business", "status"]),
        ]
