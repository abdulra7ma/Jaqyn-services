from django.db import models

from core.fields import TimeStampedModel


class StaffMember(TimeStampedModel):
    class Role(models.TextChoices):
        CASHIER = "cashier", "Cashier"
        MANAGER = "manager", "Manager"

    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="staff_members")
    user = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, related_name="staff_memberships", blank=True, null=True)
    name = models.CharField(max_length=255)
    pin_hash = models.CharField(max_length=255, blank=True, null=True)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.CASHIER)
    is_active = models.BooleanField(default=True)
    # First-login profile setup done (name + own password chosen). Owner-created
    # accounts start False and must complete on first login; owner-seeded rows
    # (ensure_owner_staff) and pre-existing rows are backfilled True.
    profile_completed = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.name} at {self.business.name}"
