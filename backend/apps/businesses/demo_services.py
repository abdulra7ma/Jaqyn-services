"""One-click demo business seeding for the admin panel.

``create_demo_business`` builds a self-contained, fully-onboarded sample business
flagged ``is_demo`` — owner login, a stamp reward program, and a small catalog —
so sales/QA can spin up a working account from the admin in one click. Every call
is unique (random suffix) so demos can be created repeatedly.
"""

import secrets
from dataclasses import dataclass
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business, CatalogItem
from apps.campaigns.models import Campaign, CampaignReward, CampaignRule
from core.logging import emit_event

# Fixed password for seeded demo owners. Safe to document: these only ever back
# is_demo businesses in dev/sales sandboxes, never real customers.
DEMO_OWNER_PASSWORD = "Demo123!"  # noqa: S105 - intentional demo credential

# Sample menu seeded onto every demo business (name, display price).
_DEMO_CATALOG = (("Espresso", "120 c"), ("Cappuccino", "180 c"), ("Latte", "190 c"))


@dataclass(frozen=True)
class DemoBusinessResult:
    """A freshly seeded demo business and the owner login to hand out."""

    business: Business
    owner_email: str
    owner_phone: str
    password: str


@transaction.atomic
def create_demo_business(name: Optional[str] = None) -> DemoBusinessResult:
    """Seed a complete demo business with a ready-to-use owner login.

    Creates a BUSINESS_OWNER user, an ``is_demo`` Business already APPROVED +
    PUBLISHED + onboarding COMPLETED + VERIFIED, a stamp reward program, and a few
    catalog items. A random suffix keeps phone/email unique per call. Returns the
    business and the owner credentials (the password is the fixed
    ``DEMO_OWNER_PASSWORD``).
    """
    suffix = secrets.token_hex(3)  # 6 hex chars, unique enough per demo
    email = f"demo+{suffix}@jaqyn.test"
    # +99670 + 7 random digits keeps the unique USERNAME_FIELD collision-free in practice.
    phone = f"+99670{secrets.randbelow(9_000_000) + 1_000_000}"
    display = name or f"Demo Cafe {suffix.upper()}"

    owner = User.objects.create(
        phone=phone, email=email, name="Demo Owner",
        role=User.Role.BUSINESS_OWNER, is_phone_verified=True, is_active=True,
    )
    owner.set_password(DEMO_OWNER_PASSWORD)
    owner.save(update_fields=["password"])

    now = timezone.now()
    business = Business.objects.create(
        owner=owner, name=display, category=Business.Category.CAFE,
        description="Seeded demo business for sales/testing.",
        area="Bishkek", city="Bishkek", phone=phone, is_demo=True,
        status=Business.Status.APPROVED,
        onboarding_status=Business.OnboardingStatus.COMPLETED,
        verification_status=Business.VerificationStatus.VERIFIED,
        visibility_status=Business.VisibilityStatus.PUBLISHED,
        verified_at=now, published_at=now,
    )

    # A loyalty stamp card is now an ACTIVE INDIVIDUAL (STAMP) campaign.
    demo_campaign = Campaign.objects.create(
        business=business, created_by=owner, name="Demo Coffee Club",
        description="Collect 6 stamps, the 7th coffee is on us.",
        campaign_type=Campaign.CampaignType.INDIVIDUAL,
        status=Campaign.Status.ACTIVE,
        completion_limit_per_customer=Campaign.CompletionLimit.REPEATABLE,
        auto_join_enabled=True,
    )
    CampaignRule.objects.create(
        campaign=demo_campaign, rule_type=CampaignRule.RuleType.VISIT_COUNT,
        mechanic=CampaignRule.Mechanic.STAMP, required_count=6,
    )
    CampaignReward.objects.create(
        campaign=demo_campaign, reward_type=CampaignReward.RewardType.FREE_ITEM,
        title="Free coffee", description="Free coffee", expiry_days_after_unlock=30,
    )
    for order, (item_name, price) in enumerate(_DEMO_CATALOG):
        CatalogItem.objects.create(
            business=business, module="menu", name=item_name, category="Coffee",
            price=price, sort_order=order, is_active=True,
        )

    emit_event("demo_business_created", business_id=str(business.id))
    return DemoBusinessResult(business=business, owner_email=email, owner_phone=phone, password=DEMO_OWNER_PASSWORD)
