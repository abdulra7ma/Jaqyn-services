from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from core.fields import TimeStampedModel


class UserManager(BaseUserManager):
    def create_user(self, phone, password=None, **extra_fields):
        if not phone:
            raise ValueError("Phone is required")
        user = self.model(phone=phone, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra_fields):
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

    phone = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.CUSTOMER)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_phone_verified = models.BooleanField(default=False)
    avatar = models.ImageField(upload_to="users/avatars/", blank=True, null=True)
    avatar_emoji = models.CharField(max_length=8, blank=True, default="")

    objects = UserManager()

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.phone


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

    def __str__(self):
        return f"Profile {self.user.phone}"
