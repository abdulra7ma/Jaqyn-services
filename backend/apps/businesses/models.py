from django.db import models
from django.utils.crypto import get_random_string

from core.fields import TimeStampedModel


class BusinessType(TimeStampedModel):
    """Catalog of business types that drive the dynamic onboarding setup forms."""

    class Module(models.TextChoices):
        MENU = "menu", "Menu"
        SERVICES = "services", "Services"
        PRODUCTS = "products", "Products"
        PLANS = "plans", "Plans"

    key = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    glyph = models.CharField(max_length=8, blank=True)
    description = models.CharField(max_length=255, blank=True)
    module = models.CharField(max_length=16, choices=Module.choices, default=Module.SERVICES)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "name")

    def __str__(self):
        return self.name


class Business(TimeStampedModel):
    class Category(models.TextChoices):
        CAFE = "cafe", "Cafe"
        RESTAURANT = "restaurant", "Restaurant"
        BARBER = "barber", "Barber"
        BEAUTY = "beauty", "Beauty"
        RETAIL = "retail", "Retail"
        BAKERY = "bakery", "Bakery"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        DISABLED = "disabled", "Disabled"

    class OnboardingStatus(models.TextChoices):
        NOT_STARTED = "not_started", "Not started"
        IN_PROGRESS = "in_progress", "In progress"
        SUBMITTED = "submitted", "Submitted"
        CHANGES_REQUESTED = "changes_requested", "Changes requested"
        COMPLETED = "completed", "Completed"

    class VerificationStatus(models.TextChoices):
        PENDING = "pending_verification", "Pending verification"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"
        SUSPENDED = "suspended", "Suspended"

    class VisibilityStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        HIDDEN = "hidden", "Hidden"
        PUBLISHED = "published", "Published"
        UNPUBLISHED = "unpublished", "Unpublished"

    # Owner is nullable: a draft business exists between admin-accept and owner activation.
    owner = models.OneToOneField(
        "accounts.User", on_delete=models.PROTECT, related_name="owned_business", null=True, blank=True
    )
    business_code = models.CharField(max_length=12, unique=True, editable=False, blank=True)
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    category = models.CharField(max_length=32, choices=Category.choices, blank=True)
    business_type = models.CharField(max_length=64, blank=True)  # BusinessType.key for dynamic setup
    description = models.TextField(blank=True, null=True)
    address = models.CharField(max_length=255, blank=True)
    area = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=128, blank=True)
    country = models.CharField(max_length=128, blank=True, default="Kyrgyzstan")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True)
    public_email = models.EmailField(blank=True, null=True)
    website_url = models.URLField(blank=True, null=True)
    instagram_url = models.CharField(max_length=255, blank=True, null=True)
    logo = models.ImageField(upload_to="business/logos/", blank=True, null=True)
    logo_set = models.BooleanField(default=False)  # MVP: tracks the demo logo tile without a real upload
    cover_image = models.ImageField(upload_to="business/covers/", blank=True, null=True)
    cover_set = models.BooleanField(default=False)
    glyph = models.CharField(max_length=8, blank=True, default="")
    accent_color = models.CharField(max_length=16, blank=True, default="#C25E3C")
    price_level = models.CharField(max_length=8, blank=True, default="cc")
    tags = models.JSONField(default=list, blank=True)
    working_hours = models.JSONField(default=dict, blank=True)
    menu_style = models.CharField(max_length=64, blank=True, default="Card grid")
    default_currency = models.CharField(max_length=16, blank=True, default="KGS")
    default_language = models.CharField(max_length=8, blank=True, default="en")
    timezone = models.CharField(max_length=64, blank=True, default="Asia/Bishkek")

    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    onboarding_status = models.CharField(
        max_length=32, choices=OnboardingStatus.choices, default=OnboardingStatus.NOT_STARTED
    )
    verification_status = models.CharField(
        max_length=32, choices=VerificationStatus.choices, default=VerificationStatus.PENDING
    )
    visibility_status = models.CharField(
        max_length=32, choices=VisibilityStatus.choices, default=VisibilityStatus.DRAFT
    )
    change_note = models.TextField(blank=True)
    submitted_at = models.DateTimeField(blank=True, null=True)
    verified_at = models.DateTimeField(blank=True, null=True)
    published_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.business_code:
            code = get_random_string(8).upper()
            while Business.objects.filter(business_code=code).exists():
                code = get_random_string(8).upper()
            self.business_code = code
        super().save(*args, **kwargs)


class CatalogItem(TimeStampedModel):
    """Menu item / service / product / plan, depending on the business type module."""

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="catalog_items")
    module = models.CharField(max_length=16, default="menu")
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=128, blank=True)
    price = models.CharField(max_length=64, blank=True)  # display string, e.g. "150 c"
    duration = models.CharField(max_length=64, blank=True)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return self.name


class StaffInvite(TimeStampedModel):
    class Role(models.TextChoices):
        MANAGER = "manager", "Manager"
        STAFF = "staff", "Staff"
        VIEWER = "viewer", "Viewer"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="staff_invites")
    full_name = models.CharField(max_length=255, blank=True)
    contact = models.CharField(max_length=255)  # email or phone
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.STAFF)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    token_hash = models.CharField(max_length=128, blank=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    accepted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.full_name or self.contact} ({self.role})"


class BusinessOwnerInvite(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    business = models.ForeignKey(Business, on_delete=models.CASCADE, related_name="owner_invites")
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True, null=True)
    token_hash = models.CharField(max_length=128, unique=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Invite {self.email or self.phone} -> {self.business_id}"
