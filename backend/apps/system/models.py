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
