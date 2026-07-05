from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from core.fields import TimeStampedModel


class UserManager(BaseUserManager):
    def create_user(self, phone=None, password=None, **extra_fields):
        if not phone and not extra_fields.get("email"):
            raise ValueError("Either phone or email is required")
        user = self.model(phone=phone or None, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone=None, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_phone_verified", True)
        return self.create_user(phone, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    class Role(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        BUSINESS_OWNER = "business_owner", "Business owner"
        STAFF = "staff", "Staff"
        ADMIN = "admin", "Admin"

    phone = models.CharField(max_length=32, unique=True, null=True, blank=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField(blank=True, null=True, unique=True)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.CUSTOMER)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_phone_verified = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    # True only for accounts created via "Sign in with Google" (see
    # authenticate_google). These have no usable password and no phone, so the
    # regular OTP/password login must refuse them rather than silently emailing
    # an OTP — Google is their only way in.
    is_google_account = models.BooleanField(default=False)
    avatar = models.ImageField(upload_to="users/avatars/", blank=True, null=True)
    avatar_emoji = models.CharField(max_length=8, blank=True, default="")

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []

    def __str__(self) -> str:
        return self.phone or self.email or str(self.id)


class CustomerProfile(TimeStampedModel):
    class Language(models.TextChoices):
        RU = "ru", "Russian"
        EN = "en", "English"
        KY = "ky", "Kyrgyz"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="customer_profile")
    birthday = models.DateField(blank=True, null=True)
    language = models.CharField(max_length=2, choices=Language.choices, default=Language.RU)
    marketing_opt_in = models.BooleanField(default=False)
    # First-run product tour seen. Persisted so the tour survives relogin/reinstall.
    onboarding_completed = models.BooleanField(default=False)
    # Required signup info (name) supplied. Persisted so the completion gate
    # survives relogin/reinstall, like onboarding_completed. Email signups set
    # this True at creation; new phone signups start False and must fill the form.
    profile_completed = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"Profile {self.user}"
