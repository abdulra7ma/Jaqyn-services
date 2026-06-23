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
    campaign_type: str = Campaign.CampaignType.VISIT,
    required_count: int = 1,
    completion_limit: str = Campaign.CompletionLimit.ONCE,
    auto_join: bool = True,
    max_rewards: int | None = None,
    max_participants: int | None = None,
    minimum_gap: timedelta | None = None,
    max_count_per_day: int | None = None,
    start_at=None,
    end_at=None,
    with_reward: bool = True,
    expiry_days: int | None = 7,
    estimated_cost: str | None = "3.50",
) -> Campaign:
    """Build a campaign with a rule (and optionally a reward) wired up.

    Defaults to an ACTIVE visit campaign requiring one visit with auto-join on,
    an all-day/every-day window, and a free-item reward.
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
        max_rewards=max_rewards,
        max_participants=max_participants,
    )
    CampaignRule.objects.create(
        campaign=campaign,
        rule_type=CampaignRule.RuleType.VISIT_COUNT,
        required_count=required_count,
        minimum_time_between_actions=minimum_gap,
        max_count_per_day=max_count_per_day,
    )
    if with_reward:
        from decimal import Decimal

        CampaignReward.objects.create(
            campaign=campaign,
            reward_type=CampaignReward.RewardType.FREE_ITEM,
            title="Free coffee",
            description="On the house",
            estimated_cost=Decimal(estimated_cost) if estimated_cost else None,
            expiry_days_after_unlock=expiry_days,
        )
    # Re-fetch with the relations so getattr(campaign, "rule"/"reward") is fresh.
    return Campaign.objects.select_related("rule", "reward").get(id=campaign.id)


def now_utc():
    return timezone.now()
