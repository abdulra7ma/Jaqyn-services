"""Tests for the owner-facing Manage Staff API (/api/business/staff/).

Covers the merged team list (members + invites) with counts and derived
fields + stats, the N+1 query-count assertion, role change, suspend/reactivate,
password reset (with linked + no-linked-user paths), remove, and the owner-only
+ cross-business scoping guarantees.
"""

import pytest
from django.contrib.auth.hashers import check_password

from apps.accounts.models import User
from apps.businesses.models import Business, StaffInvite
from apps.campaigns.models import (
    Campaign,
    CampaignReward,
    CampaignRewardVoucher,
)
from apps.qr.models import ScanLog
from apps.staff.models import StaffMember

pytestmark = pytest.mark.django_db


# --- helpers --------------------------------------------------------------


def make_business(suffix="001"):
    owner = User.objects.create_user(
        phone=f"+996709000{suffix}",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
        name=f"Owner {suffix}",
    )
    biz = Business.objects.create(
        owner=owner,
        name=f"Manage Cafe {suffix}",
        category="cafe",
        address="Main 1",
        area="center",
        phone=f"+996709100{suffix}",
        working_hours={},
        status=Business.Status.APPROVED,
    )
    return owner, biz


def make_staff_user(suffix, name="Member"):
    return User.objects.create_user(
        phone=f"+996709500{suffix}",
        role=User.Role.STAFF,
        is_phone_verified=True,
        name=name,
        email=f"staff{suffix}@example.com",
    )


def make_member(business, *, user=None, name="Adina M.", role=StaffMember.Role.MANAGER, is_active=True):
    return StaffMember.objects.create(
        business=business, user=user, name=name, role=role, is_active=is_active
    )


def make_customer(suffix):
    return User.objects.create_user(
        phone=f"+996709800{suffix}", role=User.Role.CUSTOMER, is_phone_verified=True
    )


def login(api_client, user):
    api_client.force_authenticate(user)


# --- list -----------------------------------------------------------------


def test_list_merges_members_and_invites_with_counts(api_client):
    owner, biz = make_business()
    su = make_staff_user("01", name="Adina M.")
    make_member(biz, user=su, name="Adina M.", role=StaffMember.Role.MANAGER, is_active=True)
    make_member(biz, name="Cholpon D.", role=StaffMember.Role.CASHIER, is_active=False)
    StaffInvite.objects.create(
        business=biz, full_name="Aibek B.", contact="aibek@example.com",
        role=StaffInvite.Role.STAFF, status=StaffInvite.Status.PENDING,
    )
    # A cancelled invite must NOT appear.
    StaffInvite.objects.create(
        business=biz, full_name="Gone", contact="gone@example.com",
        role=StaffInvite.Role.STAFF, status=StaffInvite.Status.CANCELLED,
    )

    login(api_client, owner)
    resp = api_client.get("/api/business/staff/")

    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["counts"] == {"total": 3, "active": 1, "invited": 1, "suspended": 1}

    by_name = {row["name"]: row for row in data["members"]}
    assert set(by_name) == {"Adina M.", "Cholpon D.", "Aibek B."}

    assert by_name["Adina M."]["kind"] == "member"
    assert by_name["Adina M."]["status"] == "active"
    assert by_name["Adina M."]["access_label"] == "Full access"
    assert by_name["Adina M."]["email"] == "staff01@example.com"
    assert by_name["Adina M."]["initials"] == "AM"

    assert by_name["Cholpon D."]["status"] == "suspended"
    assert by_name["Cholpon D."]["access_label"] == "Scan & redeem"

    invite_row = by_name["Aibek B."]
    assert invite_row["kind"] == "invite"
    assert invite_row["status"] == "invited"
    assert invite_row["email"] == "aibek@example.com"
    assert invite_row["last_active"] is None
    assert invite_row["stats"] == {"scans": 0, "redemptions": 0, "signups": 0}


def test_list_stats_count_scans_redemptions_signups(api_client):
    owner, biz = make_business()
    member = make_member(biz, name="Adina M.")
    c1, c2 = make_customer("11"), make_customer("12")

    # 2 SUCCESS scans (2 distinct customers) + 1 FAILED (not counted).
    ScanLog.objects.create(business=biz, staff=member, customer=c1, action="x", status=ScanLog.Status.SUCCESS)
    ScanLog.objects.create(business=biz, staff=member, customer=c2, action="x", status=ScanLog.Status.SUCCESS)
    ScanLog.objects.create(business=biz, staff=member, customer=c1, action="x", status=ScanLog.Status.FAILED)

    campaign = Campaign.objects.create(
        business=biz, name="R", campaign_type=Campaign.CampaignType.INDIVIDUAL,
        status=Campaign.Status.ACTIVE,
    )
    reward = CampaignReward.objects.create(
        campaign=campaign, reward_type=CampaignReward.RewardType.FREE_ITEM, title="p",
    )
    CampaignRewardVoucher.objects.create(
        campaign=campaign, customer=c1, business=biz, reward=reward,
        voucher_code="ABC123", status=CampaignRewardVoucher.Status.REDEEMED,
        redeemed_by_staff=member,
    )

    login(api_client, owner)
    resp = api_client.get("/api/business/staff/")

    row = next(r for r in resp.data["data"]["members"] if r["name"] == "Adina M.")
    assert row["stats"]["scans"] == 2
    assert row["stats"]["redemptions"] == 1
    assert row["stats"]["signups"] == 2
    assert row["last_active"] is not None


def test_list_query_count_is_bounded(api_client, django_assert_num_queries):
    owner, biz = make_business()
    for i in range(5):
        su = make_staff_user(f"6{i}", name=f"M{i}")
        member = make_member(biz, user=su, name=f"M{i}", role=StaffMember.Role.CASHIER)
        cust = make_customer(f"7{i}")
        ScanLog.objects.create(business=biz, staff=member, customer=cust, action="x", status=ScanLog.Status.SUCCESS)
    for i in range(3):
        StaffInvite.objects.create(
            business=biz, full_name=f"Inv{i}", contact=f"inv{i}@example.com",
            role=StaffInvite.Role.STAFF, status=StaffInvite.Status.PENDING,
        )

    login(api_client, owner)
    # Members(+user join) + invites + stat aggregates (scan/last-active,
    # campaign-voucher redemptions, signups). Fixed count regardless of
    # staff/invite volume — the key N+1 invariant: it does NOT grow with rows.
    with django_assert_num_queries(5):
        resp = api_client.get("/api/business/staff/")
    assert resp.status_code == 200
    assert len(resp.data["data"]["members"]) == 8


# --- detail ---------------------------------------------------------------


def test_detail_returns_member(api_client):
    owner, biz = make_business()
    member = make_member(biz, name="Adina M.")
    login(api_client, owner)
    resp = api_client.get(f"/api/business/staff/{member.id}/")
    assert resp.status_code == 200
    assert resp.data["data"]["name"] == "Adina M."
    assert resp.data["data"]["kind"] == "member"


def test_detail_cross_business_is_404(api_client):
    owner, biz = make_business("001")
    _, other = make_business("002")
    member = make_member(other, name="Other")
    login(api_client, owner)
    resp = api_client.get(f"/api/business/staff/{member.id}/")
    assert resp.status_code == 404


# --- role change ----------------------------------------------------------


def test_change_role(api_client):
    owner, biz = make_business()
    member = make_member(biz, role=StaffMember.Role.CASHIER)
    login(api_client, owner)
    resp = api_client.patch(f"/api/business/staff/{member.id}/", {"role": "manager"}, format="json")
    assert resp.status_code == 200
    assert resp.data["data"]["role"] == "manager"
    member.refresh_from_db()
    assert member.role == StaffMember.Role.MANAGER


def test_change_role_rejects_invalid(api_client):
    owner, biz = make_business()
    member = make_member(biz)
    login(api_client, owner)
    resp = api_client.patch(f"/api/business/staff/{member.id}/", {"role": "wizard"}, format="json")
    assert resp.status_code == 400


# --- suspend / reactivate -------------------------------------------------


def test_suspend_and_reactivate(api_client):
    owner, biz = make_business()
    member = make_member(biz, is_active=True)
    login(api_client, owner)

    resp = api_client.post(f"/api/business/staff/{member.id}/suspend/")
    assert resp.status_code == 200
    assert resp.data["data"]["status"] == "suspended"
    member.refresh_from_db()
    assert member.is_active is False

    resp = api_client.post(f"/api/business/staff/{member.id}/reactivate/")
    assert resp.status_code == 200
    assert resp.data["data"]["status"] == "active"
    member.refresh_from_db()
    assert member.is_active is True


# --- reset password -------------------------------------------------------


def test_reset_password_returns_working_temp_password(api_client):
    owner, biz = make_business()
    su = make_staff_user("31")
    su.set_password("oldpassword")
    su.save()
    member = make_member(biz, user=su)
    login(api_client, owner)

    resp = api_client.post(f"/api/business/staff/{member.id}/reset-password/")
    assert resp.status_code == 200
    temp = resp.data["data"]["temp_password"]
    assert temp

    su.refresh_from_db()
    assert check_password(temp, su.password)
    assert not check_password("oldpassword", su.password)


def test_reset_password_no_linked_user_is_error(api_client):
    owner, biz = make_business()
    member = make_member(biz, user=None)
    login(api_client, owner)
    resp = api_client.post(f"/api/business/staff/{member.id}/reset-password/")
    assert resp.status_code == 409
    assert resp.data["error"]["code"] == "NO_LINKED_USER"


# --- remove ---------------------------------------------------------------


def test_remove_member(api_client):
    owner, biz = make_business()
    member = make_member(biz)
    login(api_client, owner)
    resp = api_client.delete(f"/api/business/staff/{member.id}/")
    assert resp.status_code == 200
    assert not StaffMember.objects.filter(id=member.id).exists()


# --- auth + scoping -------------------------------------------------------


def test_list_requires_owner_role(api_client):
    owner, biz = make_business()
    make_member(biz)
    customer = make_customer("91")
    login(api_client, customer)
    resp = api_client.get("/api/business/staff/")
    assert resp.status_code in (401, 403)


def test_list_requires_authentication(api_client):
    owner, biz = make_business()
    resp = api_client.get("/api/business/staff/")
    assert resp.status_code in (401, 403)


def test_cannot_mutate_other_business_staff(api_client):
    owner, biz = make_business("001")
    _, other = make_business("002")
    member = make_member(other)
    login(api_client, owner)

    assert api_client.patch(f"/api/business/staff/{member.id}/", {"role": "manager"}, format="json").status_code == 404
    assert api_client.post(f"/api/business/staff/{member.id}/suspend/").status_code == 404
    assert api_client.delete(f"/api/business/staff/{member.id}/").status_code == 404
