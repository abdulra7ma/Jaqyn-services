"""Tests for the staff-till stats + unified activity feed (handoff plan §B1).

Covers /api/staff/stats/ (today-scoped counters) and the reworked
/api/staff/recent-activity/ (one `events` list): auth, non-staff rejection,
happy paths, the ?kind= filter (incl. invalid value), pagination bounds, the
business-scoping guarantee, and the flat query-count assertion.
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.campaigns.models import Campaign, CampaignReward, CampaignRewardVoucher
from apps.loyalty.models import (
    LoyaltyMembership,
    LoyaltyProgram,
    LoyaltyTransaction,
    LoyaltyVoucher,
)
from apps.qr.models import ScanLog
from apps.staff.models import StaffMember

pytestmark = pytest.mark.django_db

STATS_URL = "/api/staff/stats/"
ACTIVITY_URL = "/api/staff/recent-activity/"


# --- helpers --------------------------------------------------------------


def make_business(suffix="001"):
    owner = User.objects.create_user(
        phone=f"+996708000{suffix}",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
        name=f"Owner {suffix}",
    )
    biz = Business.objects.create(
        owner=owner,
        name=f"Till Cafe {suffix}",
        category="cafe",
        address="Main 1",
        area="center",
        phone=f"+996708100{suffix}",
        working_hours={},
        status=Business.Status.APPROVED,
    )
    return owner, biz


def make_staff(business, suffix="01"):
    user = User.objects.create_user(
        phone=f"+996708500{suffix}",
        role=User.Role.STAFF,
        is_phone_verified=True,
        name=f"Till Staff {suffix}",
    )
    member = StaffMember.objects.create(
        business=business, user=user, name=user.name, role=StaffMember.Role.CASHIER
    )
    return user, member


def make_customer(suffix="01", name="Aida Nurlanovna"):
    return User.objects.create_user(
        phone=f"+996708900{suffix}",
        role=User.Role.CUSTOMER,
        is_phone_verified=True,
        name=name,
    )


def make_scan(business, staff, customer, action, *, status=ScanLog.Status.SUCCESS, metadata=None, created_at=None):
    scan = ScanLog.objects.create(
        business=business, staff=staff, customer=customer,
        action=action, status=status, metadata=metadata or {},
    )
    if created_at is not None:
        ScanLog.objects.filter(id=scan.id).update(created_at=created_at)
        scan.refresh_from_db()
    return scan


def make_campaign(business, name="Visit Streak"):
    campaign = Campaign.objects.create(
        business=business, name=name,
        campaign_type=Campaign.CampaignType.INDIVIDUAL,
        status=Campaign.Status.ACTIVE,
    )
    reward = CampaignReward.objects.create(
        campaign=campaign,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        title="Free coffee",
    )
    return campaign, reward


def make_campaign_redemption(business, customer, staff_member, *, code, redeemed_at):
    campaign, reward = make_campaign(business, name=f"Campaign {code}")
    return CampaignRewardVoucher.objects.create(
        campaign=campaign, customer=customer, business=business, reward=reward,
        voucher_code=code, status=CampaignRewardVoucher.Status.REDEEMED,
        redeemed_at=redeemed_at, redeemed_by_staff=staff_member,
    )


def make_loyalty_program(business, *, type=LoyaltyProgram.Type.STAMP, name="Stamp Card"):
    return LoyaltyProgram.objects.create(
        business=business, type=type, name=name,
        reward_type=LoyaltyProgram.RewardType.FREE_ITEM, reward_title="Free bun",
    )


def make_earn(business, customer, program, *, stamps=None, points=None):
    membership, _ = LoyaltyMembership.objects.get_or_create(
        program=program, customer=customer
    )
    return LoyaltyTransaction.objects.create(
        membership=membership, program=program, customer=customer, business=business,
        kind=LoyaltyTransaction.Kind.EARN, stamps_delta=stamps, points_delta=points,
    )


def make_loyalty_redemption(business, customer, program, *, code, redeemed_at):
    membership, _ = LoyaltyMembership.objects.get_or_create(
        program=program, customer=customer
    )
    return LoyaltyVoucher.objects.create(
        membership=membership, program=program, customer=customer, business=business,
        voucher_code=code, status=LoyaltyVoucher.Status.REDEEMED,
        reward_type=LoyaltyProgram.RewardType.FREE_ITEM, reward_title="Free bun",
        redeemed_at=redeemed_at,
    )


# --- auth + permission ----------------------------------------------------


@pytest.mark.parametrize("url", [STATS_URL, ACTIVITY_URL])
def test_endpoints_require_auth(api_client, url):
    assert api_client.get(url).status_code == 401


@pytest.mark.parametrize("url", [STATS_URL, ACTIVITY_URL])
def test_endpoints_reject_non_staff(api_client, url):
    customer = make_customer("77")
    api_client.force_authenticate(customer)
    assert api_client.get(url).status_code == 403


# --- stats ----------------------------------------------------------------


def test_stats_counts_today_only_for_own_business(api_client):
    _, biz = make_business("001")
    _, other_biz = make_business("002")
    staff_user, member = make_staff(biz)
    customer = make_customer("01")
    yesterday = timezone.now() - timedelta(days=1)

    # Count: two SUCCESS scans today.
    make_scan(biz, member, customer, "campaign_confirm_visit")
    make_scan(biz, member, customer, "staff_scan")
    # Don't count: failed today, success yesterday, other business today.
    make_scan(biz, member, customer, "campaign_confirm_visit", status=ScanLog.Status.FAILED)
    make_scan(biz, member, customer, "campaign_confirm_visit", created_at=yesterday)
    make_scan(other_biz, None, customer, "campaign_confirm_visit")

    # Count: one campaign + one loyalty redemption today. Don't count: yesterday's.
    make_campaign_redemption(biz, customer, member, code="RED-T1", redeemed_at=timezone.now())
    program = make_loyalty_program(biz)
    make_loyalty_redemption(biz, customer, program, code="RED-T2", redeemed_at=timezone.now())
    make_campaign_redemption(biz, customer, member, code="RED-Y1", redeemed_at=yesterday)

    # Count: a loyalty EARN today (stamp awards write a transaction, not a scan log).
    make_earn(biz, customer, program, stamps=1)

    api_client.force_authenticate(staff_user)
    resp = api_client.get(STATS_URL)

    assert resp.status_code == 200
    assert resp.data["data"] == {"scans_today": 3, "redemptions_today": 2}


# --- activity feed --------------------------------------------------------


def test_activity_merges_all_kinds_newest_first(api_client):
    _, biz = make_business("011")
    _, other_biz = make_business("012")
    staff_user, member = make_staff(biz, "11")
    customer = make_customer("11", name="Aida Nurlanovna")
    now = timezone.now()

    campaign, _ = make_campaign(biz, name="Morning Streak")
    make_scan(
        biz, member, customer, "campaign_confirm_visit",
        metadata={"campaign_id": str(campaign.id)}, created_at=now - timedelta(minutes=50),
    )
    make_scan(biz, member, customer, "campaign_confirm_social", created_at=now - timedelta(minutes=40))
    program = make_loyalty_program(biz, name="Stamp Card")
    stamp = make_earn(biz, customer, program, stamps=1)
    LoyaltyTransaction.objects.filter(id=stamp.id).update(created_at=now - timedelta(minutes=30))
    points_program = make_loyalty_program(biz, type=LoyaltyProgram.Type.POINTS, name="Points Card")
    points = make_earn(biz, customer, points_program, points=25)
    LoyaltyTransaction.objects.filter(id=points.id).update(created_at=now - timedelta(minutes=20))
    make_campaign_redemption(biz, customer, member, code="RD-1", redeemed_at=now - timedelta(minutes=10))
    make_loyalty_redemption(biz, customer, program, code="RD-2", redeemed_at=now)
    # Noise that must NOT appear: a bare resolve log and another business's event.
    make_scan(biz, member, customer, "staff_scan")
    make_scan(other_biz, None, customer, "campaign_confirm_visit")

    api_client.force_authenticate(staff_user)
    resp = api_client.get(ACTIVITY_URL)

    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["count"] == 6
    kinds = [e["kind"] for e in data["results"]]
    assert kinds == ["redeem", "redeem", "points", "stamp", "social", "visit"]
    # Masked customer + data labels.
    assert all(e["customer"] == "Aida N." for e in data["results"])
    visit = data["results"][-1]
    assert visit["label"] == "Morning Streak"
    assert data["results"][2]["label"] == "Points Card"
    assert data["results"][0]["label"] == "Free bun"  # loyalty voucher reward title


def test_activity_kind_filter(api_client):
    _, biz = make_business("021")
    staff_user, member = make_staff(biz, "21")
    customer = make_customer("21")

    make_scan(biz, member, customer, "campaign_confirm_visit")
    make_campaign_redemption(biz, customer, member, code="F-1", redeemed_at=timezone.now())

    api_client.force_authenticate(staff_user)
    resp = api_client.get(ACTIVITY_URL, {"kind": "redeem"})
    assert resp.status_code == 200
    assert [e["kind"] for e in resp.data["data"]["results"]] == ["redeem"]

    resp = api_client.get(ACTIVITY_URL, {"kind": "visit"})
    assert [e["kind"] for e in resp.data["data"]["results"]] == ["visit"]

    assert api_client.get(ACTIVITY_URL, {"kind": "bogus"}).status_code == 400


def test_activity_pagination_bounds(api_client):
    _, biz = make_business("031")
    staff_user, member = make_staff(biz, "31")
    customer = make_customer("31")
    for i in range(3):
        make_scan(biz, member, customer, "campaign_confirm_visit")

    api_client.force_authenticate(staff_user)
    resp = api_client.get(ACTIVITY_URL, {"page_size": 2})
    data = resp.data["data"]
    assert data["count"] == 3
    assert len(data["results"]) == 2
    assert data["next"] is not None

    resp = api_client.get(ACTIVITY_URL, {"page_size": 2, "page": 2})
    assert len(resp.data["data"]["results"]) == 1
    assert resp.data["data"]["next"] is None

    # The hard max page size is clamped project-wide (max_page_size=100): an
    # oversized page_size must not error and must still return everything here.
    resp = api_client.get(ACTIVITY_URL, {"page_size": 100000})
    assert resp.status_code == 200
    assert len(resp.data["data"]["results"]) == 3


def test_activity_query_count_is_flat(api_client, django_assert_num_queries):
    _, biz = make_business("041")
    staff_user, member = make_staff(biz, "41")
    program = make_loyalty_program(biz)

    def seed(suffix):
        customer = make_customer(suffix)
        campaign, _ = make_campaign(biz, name=f"C {suffix}")
        make_scan(
            biz, member, customer, "campaign_confirm_visit",
            metadata={"campaign_id": str(campaign.id)},
        )
        make_earn(biz, customer, program, stamps=1)
        make_campaign_redemption(biz, customer, member, code=f"Q-{suffix}", redeemed_at=timezone.now())
        make_loyalty_redemption(biz, customer, program, code=f"QL-{suffix}", redeemed_at=timezone.now())

    seed("41")
    api_client.force_authenticate(staff_user)

    # 1 staff lookup + scans + campaign-name bulk + loyalty earns + campaign
    # vouchers + loyalty vouchers = 6, flat regardless of row count.
    with django_assert_num_queries(6):
        resp = api_client.get(ACTIVITY_URL)
    assert resp.data["data"]["count"] == 4

    seed("42")
    seed("43")
    with django_assert_num_queries(6):
        resp = api_client.get(ACTIVITY_URL)
    assert resp.data["data"]["count"] == 12
