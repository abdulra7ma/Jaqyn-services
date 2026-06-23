from django.db import models

from core.fields import UUIDModel


class QRCodeToken(UUIDModel):
    class Type(models.TextChoices):
        MERCHANT_COLLECT = "merchant_collect", "Merchant collect"
        CUSTOMER_PROFILE = "customer_profile", "Customer profile"
        REWARD_REDEEM = "reward_redeem", "Reward redeem"
        GROUP_INVITE = "group_invite", "Group invite"
        GROUP_CHECKIN = "group_checkin", "Group check-in"
        GROUP_REWARD = "group_reward", "Group reward"
        CAMPAIGN = "campaign", "Campaign"
        CAMPAIGN_REWARD = "campaign_reward", "Campaign reward"

    token = models.CharField(max_length=128, unique=True, db_index=True)
    type = models.CharField(max_length=32, choices=Type.choices)
    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="qr_tokens", blank=True, null=True)
    customer = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="qr_tokens", blank=True, null=True)
    reward_progress = models.ForeignKey("loyalty.CustomerRewardProgress", on_delete=models.CASCADE, related_name="qr_tokens", blank=True, null=True)
    reward_redemption = models.ForeignKey("loyalty.RewardRedemption", on_delete=models.CASCADE, related_name="qr_tokens", blank=True, null=True)
    group_deal = models.ForeignKey("groups.GroupDeal", on_delete=models.CASCADE, related_name="qr_tokens", blank=True, null=True)
    campaign = models.UUIDField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.type}:{self.token[:8]}"


class ApprovalCode(UUIDModel):
    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="approval_codes")
    code = models.CharField(max_length=12)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.business.name} {self.code}"


class ScanLog(UUIDModel):
    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"
        BLOCKED = "blocked", "Blocked"

    qr_token = models.ForeignKey(QRCodeToken, on_delete=models.SET_NULL, related_name="scan_logs", blank=True, null=True)
    token_value = models.CharField(max_length=128, blank=True, null=True)
    customer = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, related_name="scan_logs", blank=True, null=True)
    business = models.ForeignKey("businesses.Business", on_delete=models.SET_NULL, related_name="scan_logs", blank=True, null=True)
    staff = models.ForeignKey("staff.StaffMember", on_delete=models.SET_NULL, related_name="scan_logs", blank=True, null=True)
    action = models.CharField(max_length=64)
    status = models.CharField(max_length=16, choices=Status.choices)
    failure_reason = models.CharField(max_length=64, blank=True, null=True)
    ip_address = models.CharField(max_length=64, blank=True, null=True)
    user_agent = models.TextField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
