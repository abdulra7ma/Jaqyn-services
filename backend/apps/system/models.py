from django.db import models


class SystemConfiguration(models.Model):
    """
    Singleton row holding admin-tunable, site-wide settings.

    Edit from the Django admin (System → System configuration). Always load via
    ``SystemConfiguration.load()`` so a row exists even on a fresh database.
    """

    max_active_groups_per_user = models.PositiveSmallIntegerField(
        default=3,
        help_text="Maximum number of active group deals a customer can belong to at the same time.",
    )

    # Default free-trial length applied when a business is approved. 30 days is the
    # standard launch trial; admins can override per business via Business.trial_ends_at.
    trial_period_days = models.PositiveSmallIntegerField(
        default=30,
        help_text="Length of the free trial (days) applied to a business when it is approved.",
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "System configuration"
        verbose_name_plural = "System configuration"

    def __str__(self):
        return "System configuration"

    def save(self, *args, **kwargs):
        self.pk = 1  # enforce a single row
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "SystemConfiguration":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
