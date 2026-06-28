"""Shared builders for campaign service tests.

Plain helper functions in the style of the loyalty test suite (no factory_boy
classes needed for this layer). Phone numbers are unique per call site via the
``suffix`` argument so multiple businesses/customers can coexist in one test.
"""

from __future__ import annotations

from datetime import time, timedelta

from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.campaigns.models import (
    Campaign,
    CampaignReward,
    CampaignRule,
)
from apps.staff.models import StaffMember


def make_business(suffix: str = "001") -> Business:
    owner = User.objects.create_user(
        phone=f"+99670400{suffix}",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
    )
    return Business.objects.create(
        owner=owner,
        name=f"Campaign Cafe {suffix}",
        category="cafe",
        address="Toktogul 1",
        area="center",
        phone=f"+99670410{suffix}",
        working_hours={},
        status=Business.Status.APPROVED,
    )


def make_customer(suffix: str = "001") -> User:
    return User.objects.create_user(
        phone=f"+99670500{suffix}",
        role=User.Role.CUSTOMER,
        is_phone_verified=True,
        name=f"Customer {suffix}",
    )


def make_staff(
    business: Business, role: str = StaffMember.Role.CASHIER, suffix: str = "001"
) -> StaffMember:
    user = User.objects.create_user(
        phone=f"+99670600{suffix}",
        role=User.Role.STAFF,
        is_phone_verified=True,
        name=f"Staff {suffix}",
    )
    return StaffMember.objects.create(
        business=business, user=user, name=f"Staff {suffix}", role=role
    )


def make_campaign(
    business: Business,
    *,
    status: str = Campaign.Status.ACTIVE,
    campaign_type: str = Campaign.CampaignType.INDIVIDUAL,
    mechanic: str | None = CampaignRule.Mechanic.VISIT,
    required_count: int = 1,
    required_group_size: int | None = None,
    group_checkin_window_minutes: int | None = None,
    instagram_handle: str | None = None,
    completion_limit: str = Campaign.CompletionLimit.ONCE,
    auto_join: bool = True,
    allow_multiple: bool = False,
    max_rewards: int | None = None,
    max_participants: int | None = None,
    minimum_gap: timedelta | None = None,
    max_count_per_day: int | None = None,
    start_at=None,
    end_at=None,
    with_reward: bool = True,
    reward_type: str = CampaignReward.RewardType.FREE_ITEM,
    item_selection: str | None = None,
    catalog_item=None,
    expiry_days: int | None = 7,
    estimated_cost: str | None = "3.50",
) -> Campaign:
    """Build a campaign with a rule (and optionally a reward) wired up.

    Defaults to an ACTIVE INDIVIDUAL visit campaign requiring one visit with
    auto-join on, an all-day/every-day window, and a free-item reward. Pass
    ``required_group_size`` (GROUP) or ``instagram_handle`` (SOCIAL) to build
    the other campaign shapes.
    """
    campaign = Campaign.objects.create(
        business=business,
        name="Buy 5 get 1",
        campaign_type=campaign_type,
        status=status,
        start_at=start_at,
        end_at=end_at,
        active_days=[],
        active_start_time=time(0, 0),
        active_end_time=time(23, 59),
        completion_limit_per_customer=completion_limit,
        auto_join_enabled=auto_join,
        allow_multiple_campaign_counting=allow_multiple,
        max_rewards=max_rewards,
        max_participants=max_participants,
        instagram_handle=instagram_handle,
    )
    rule_type = (
        CampaignRule.RuleType.GROUP_CHECKIN
        if campaign_type == Campaign.CampaignType.GROUP
        else CampaignRule.RuleType.VISIT_COUNT
    )
    CampaignRule.objects.create(
        campaign=campaign,
        rule_type=rule_type,
        mechanic=mechanic
        if campaign_type == Campaign.CampaignType.INDIVIDUAL
        else None,
        required_count=required_count,
        required_group_size=required_group_size,
        group_checkin_window_minutes=group_checkin_window_minutes,
        minimum_time_between_actions=minimum_gap,
        max_count_per_day=max_count_per_day,
    )
    if with_reward:
        from decimal import Decimal

        CampaignReward.objects.create(
            campaign=campaign,
            reward_type=reward_type,
            title="Free coffee",
            description="On the house",
            estimated_cost=Decimal(estimated_cost) if estimated_cost else None,
            expiry_days_after_unlock=expiry_days,
            item_selection=item_selection,
            catalog_item=catalog_item,
        )
    # Re-fetch with the relations so getattr(campaign, "rule"/"reward") is fresh.
    return Campaign.objects.select_related("rule", "reward").get(id=campaign.id)


def make_catalog_item(business: Business, *, name: str = "Latte", price: str = "150 c"):
    """Build an active CatalogItem on a business (for item-reward tests)."""
    from apps.businesses.models import CatalogItem

    return CatalogItem.objects.create(
        business=business, module="menu", name=name, price=price, is_active=True
    )


def now_utc():
    return timezone.now()
