from django.contrib import admin

from apps.loyalty.models import (
    LoyaltyMembership,
    LoyaltyProgram,
    LoyaltyTier,
    LoyaltyTransaction,
    LoyaltyVoucher,
)

admin.site.register(LoyaltyProgram)
admin.site.register(LoyaltyTier)
admin.site.register(LoyaltyMembership)
admin.site.register(LoyaltyTransaction)
admin.site.register(LoyaltyVoucher)
