from django.db import models

from core.fields import UUIDModel


class AdminAuditLog(UUIDModel):
    admin = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, related_name="admin_audit_logs", blank=True, null=True)
    action = models.CharField(max_length=64)
    target_type = models.CharField(max_length=64)
    target_id = models.CharField(max_length=64)
    reason = models.TextField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
