from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class LeadColumn(models.Model):
    """A runtime-defined column in the lead table.

    ``key`` is the property name inside ``Lead.data``. ``type`` is editable so a
    column can be re-typed after creation; ``choices`` backs SELECT/MULTISELECT.
    """

    class ColumnType(models.TextChoices):
        TEXT = "text", _("Text")
        NUMBER = "number", _("Number")
        DATE = "date", _("Date")
        BOOLEAN = "boolean", _("Boolean")
        URL = "url", _("URL")
        SELECT = "select", _("Select")
        MULTISELECT = "multiselect", _("Multi-select")

    key = models.SlugField(max_length=64, unique=True)
    label = models.CharField(max_length=120)
    type = models.CharField(max_length=16, choices=ColumnType.choices, default=ColumnType.TEXT)
    choices = models.JSONField(default=list, blank=True)  # list[str] for SELECT/MULTISELECT
    order = models.PositiveIntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    editable = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.label


class LeadStatus(models.Model):
    """A pipeline status admins manage at runtime (name + color + order)."""

    name = models.CharField(max_length=60, unique=True)
    color = models.CharField(max_length=7, default="#8C7A6A")  # hex; design-system §1
    order = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "id"]
        verbose_name_plural = "Lead statuses"

    def __str__(self) -> str:
        return self.name


class Lead(models.Model):
    """One lead row. All column values live in ``data``, keyed by LeadColumn.key."""

    data = models.JSONField(default=dict)
    status = models.ForeignKey(
        LeadStatus, null=True, blank=True, on_delete=models.SET_NULL, related_name="leads"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return str(self.data.get("business_name") or f"Lead #{self.pk}")
