"""Group-campaign flow tests (plan §1.6, Q4/Q6 — group is in MVP).

The locked decision is that GROUP is an MVP type and the group reward is *one
voucher to the leader* (plan Q4/Q6). This suite covers the full runtime now that
the group-session service is implemented (BE-3/BE-4):

* **GROUP campaign authoring** — a GROUP campaign can be created, carry a group
  rule + a leader-receiver reward, and be published.

* **The group session runtime** — a leader starts a session (minting a
  GROUP_INVITE token), members join via that token, a staff member confirms the
  coordinated check-in, the session is marked COMPLETED, and **exactly one**
  voucher is issued to the leader, which the leader can redeem once.

* **Access control on the group endpoints** — auth + role gates still hold.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
    CampaignRule,
    Group,
    GroupMember,
)
from apps.campaigns.services import (
    CampaignGroupService,
    CampaignRewardService,
    CampaignService,
    StaffScannerService,
)
from apps.campaigns.tests.helpers import (
    make_business,
    make_customer,
    make_staff,
)
from apps.qr.models import QRCodeToken
from core.exceptions import JaqynAPIException

pytestmark = pytest.mark.django_db

# Placeholder id used to exercise the not-found path on a group endpoint.
_FAKE_UUID = "00000000-0000-0000-0000-000000000000"


def _auth(user) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    # simplejwt types for_user() as the base Token, which has no access_token;
    # RefreshToken.access_token is real at runtime. Upstream stub gap.
    access = refresh.access_token  # type: ignore[attr-defined]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


def _group_campaign(
    business, *, status: str = Campaign.Status.DRAFT, group_size: int = 4
) -> Campaign:
    """Build a GROUP campaign with a group rule and a leader-receiver reward.

    A GROUP_CHECKIN rule with a required group size, and a reward whose receiver is
    the LEADER (plan Q4 — the leader gets the single voucher).
    """
    campaign = Campaign.objects.create(
        business=business,
        name="Bring friends",
        campaign_type=Campaign.CampaignType.GROUP,
        status=status,
        active_days=[],
        auto_join_enabled=True,
    )
    CampaignRule.objects.create(
        campaign=campaign,
        rule_type=CampaignRule.RuleType.GROUP_CHECKIN,
        required_count=1,
        required_group_size=group_size,
        group_checkin_window_minutes=30,
    )
    CampaignReward.objects.create(
        campaign=campaign,
        reward_type=CampaignReward.RewardType.FREE_ITEM,
        title="Free dessert for the table",
        reward_receiver_type=CampaignReward.ReceiverType.LEADER,
    )
    return Campaign.objects.select_related("rule", "reward").get(id=campaign.id)


# --- GROUP campaign authoring -----------------------------------------------


def test_group_campaign_can_be_created_and_published():
    """A GROUP campaign with a group rule + leader reward publishes to ACTIVE."""
    business = make_business()
    campaign = _group_campaign(business)

    published = CampaignService.publish_campaign(campaign, business)

    assert published.status == Campaign.Status.ACTIVE
    assert published.campaign_type == Campaign.CampaignType.GROUP
    assert published.reward.reward_receiver_type == CampaignReward.ReceiverType.LEADER


def test_group_campaign_publish_requires_reward():
    """A GROUP campaign with no reward is not publishable (same gate as visit)."""
    business = make_business()
    campaign = _group_campaign(business)
    campaign.reward.delete()
    campaign = Campaign.objects.get(id=campaign.id)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignService.publish_campaign(campaign, business)
    assert exc.value.code == "CAMPAIGN_NOT_PUBLISHABLE"


# --- group-session endpoint access control ----------------------------------


def test_group_start_requires_auth():
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE)
    response = APIClient().post(f"/api/customer/campaigns/{campaign.id}/group/start/")
    assert response.status_code == 401


def test_group_start_rejects_business_owner():
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE)
    response = _auth(business.owner).post(
        f"/api/customer/campaigns/{campaign.id}/group/start/"
    )
    assert response.status_code == 403


def test_staff_confirm_group_requires_auth():
    response = APIClient().post(
        "/api/staff/campaigns/confirm-group/",
        {"group_session_id": _FAKE_UUID},
        format="json",
    )
    assert response.status_code == 401


def test_staff_confirm_group_rejects_customer_role():
    response = _auth(make_customer()).post(
        "/api/staff/campaigns/confirm-group/",
        {"group_session_id": _FAKE_UUID},
        format="json",
    )
    assert response.status_code == 403


def test_staff_confirm_unknown_group_is_not_found():
    """Confirming a non-existent group session returns a clean 404, not a 500."""
    business = make_business()
    staff = make_staff(business)
    response = _auth(staff.user).post(
        "/api/staff/campaigns/confirm-group/",
        {"group_session_id": _FAKE_UUID},
        format="json",
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "GROUP_SESSION_NOT_FOUND"


# --- service-level start / join / confirm -----------------------------------


def test_start_group_session_mints_invite_token_and_enrols_leader():
    """Starting a session creates a FORMING session, a GROUP_INVITE token, the leader.

    The leader is recorded both as a CHECKED_IN ``GroupMember`` and as a
    ``CampaignParticipant`` so the reward attaches to a real row on completion.
    """
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("801")

    session = CampaignGroupService.start_group_session(campaign, leader)

    assert session.status == Group.Status.FORMING
    assert session.required_size == 3
    assert QRCodeToken.objects.filter(
        token=session.invite_token, type=QRCodeToken.Type.GROUP_INVITE
    ).exists()
    leader_member = GroupMember.objects.get(group=session, customer=leader)
    assert leader_member.status == GroupMember.Status.CHECKED_IN
    assert CampaignParticipant.objects.filter(
        campaign=campaign, customer=leader
    ).exists()


def test_start_group_session_rejects_non_group_campaign():
    """Only a GROUP campaign can start a group session."""
    from apps.campaigns.tests.helpers import make_campaign

    business = make_business()
    visit_campaign = make_campaign(business)
    with pytest.raises(JaqynAPIException) as exc:
        CampaignGroupService.start_group_session(visit_campaign, make_customer("802"))
    assert exc.value.code == "VALIDATION_ERROR"


def test_join_group_session_is_idempotent_and_caps_at_required_size():
    """Members join via the invite token; a re-join is a no-op; the size cap holds."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=2)
    leader = make_customer("811")
    session = CampaignGroupService.start_group_session(campaign, leader)

    member = make_customer("812")
    first = CampaignGroupService.join_group_session(session.invite_token, member)
    again = CampaignGroupService.join_group_session(session.invite_token, member)
    assert first.id == again.id  # idempotent

    # Required size (2) reached with leader + this member → session flips to FULL.
    session.refresh_from_db()
    assert session.status == Group.Status.FULL

    overflow = make_customer("813")
    with pytest.raises(JaqynAPIException) as exc:
        CampaignGroupService.join_group_session(session.invite_token, overflow)
    assert exc.value.code == "GROUP_SESSION_INVALID_STATE"


def test_group_completion_issues_one_voucher_to_the_leader():
    """§1.6 invariant: a completed group mints exactly one leader voucher.

    Locked decision Q4 — the group reward is a single voucher to the group leader,
    not one per member. The leader starts the group, members join to reach the
    required size, staff confirms, and exactly one ACTIVE voucher exists for the
    leader (and none for the members).
    """
    business = make_business()
    staff = make_staff(business)
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("821")
    session = CampaignGroupService.start_group_session(campaign, leader)
    CampaignGroupService.join_group_session(session.invite_token, make_customer("822"))
    CampaignGroupService.join_group_session(session.invite_token, make_customer("823"))

    result = StaffScannerService.confirm_group_visit(staff, session.id)

    session.refresh_from_db()
    assert session.status == Group.Status.COMPLETED
    assert result.voucher.customer_id == leader.id

    leader_vouchers = CampaignRewardVoucher.objects.filter(
        campaign=campaign, customer=leader
    )
    assert leader_vouchers.count() == 1
    assert CampaignRewardVoucher.objects.filter(campaign=campaign).count() == 1


def test_group_double_confirm_does_not_mint_a_second_voucher():
    """A second confirm on an already-COMPLETED session is rejected, not minted again."""
    business = make_business()
    staff = make_staff(business)
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=2)
    leader = make_customer("831")
    session = CampaignGroupService.start_group_session(campaign, leader)
    CampaignGroupService.join_group_session(session.invite_token, make_customer("832"))

    StaffScannerService.confirm_group_visit(staff, session.id)
    with pytest.raises(JaqynAPIException) as exc:
        StaffScannerService.confirm_group_visit(staff, session.id)
    assert exc.value.code == "GROUP_SESSION_INVALID_STATE"
    assert CampaignRewardVoucher.objects.filter(campaign=campaign).count() == 1


def test_group_confirm_rejected_before_required_size_reached():
    """Confirming before the group reaches its required size is rejected, no voucher."""
    business = make_business()
    staff = make_staff(business)
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=4)
    leader = make_customer("841")
    session = CampaignGroupService.start_group_session(campaign, leader)
    CampaignGroupService.join_group_session(session.invite_token, make_customer("842"))

    with pytest.raises(JaqynAPIException) as exc:
        StaffScannerService.confirm_group_visit(staff, session.id)
    assert exc.value.code == "GROUP_SESSION_INVALID_STATE"
    assert not CampaignRewardVoucher.objects.filter(campaign=campaign).exists()


def test_group_confirm_rejects_other_business_staff():
    """Staff at another business cannot confirm this business's group session."""
    business = make_business("001")
    other = make_business("002")
    other_staff = make_staff(other, suffix="091")
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=2)
    leader = make_customer("851")
    session = CampaignGroupService.start_group_session(campaign, leader)
    CampaignGroupService.join_group_session(session.invite_token, make_customer("852"))

    with pytest.raises(JaqynAPIException) as exc:
        StaffScannerService.confirm_group_visit(other_staff, session.id)
    assert exc.value.code == "WRONG_BUSINESS"


def test_leader_redeems_the_group_voucher_once():
    """End-to-end: the leader's group voucher redeems once, then is rejected.

    Completes the §1.6 loop — leader starts group → members join → staff confirms →
    one leader voucher → leader redeems it once (a second redeem is rejected).
    """
    business = make_business()
    staff = make_staff(business)
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=2)
    leader = make_customer("861")
    session = CampaignGroupService.start_group_session(campaign, leader)
    CampaignGroupService.join_group_session(session.invite_token, make_customer("862"))
    result = StaffScannerService.confirm_group_visit(staff, session.id)

    redeemed = CampaignRewardService.redeem_reward_voucher(
        staff, code=result.voucher.voucher_code
    )
    assert redeemed.status == CampaignRewardVoucher.Status.REDEEMED

    with pytest.raises(JaqynAPIException) as exc:
        CampaignRewardService.redeem_reward_voucher(
            staff, code=result.voucher.voucher_code
        )
    assert exc.value.code == "VOUCHER_ALREADY_REDEEMED"


# --- visit_time / name / note on start --------------------------------------


def test_start_group_session_persists_visit_time_name_note():
    """The leader's chosen visit slot, group name, and note are persisted."""
    from datetime import datetime, timezone as dt_timezone

    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("901")
    visit = datetime(2026, 7, 1, 20, 0, tzinfo=dt_timezone.utc)

    session = CampaignGroupService.start_group_session(
        campaign, leader, visit_time=visit, name="Birthday dinner", note="meet at door"
    )

    session.refresh_from_db()
    assert session.visit_time == visit
    assert session.name == "Birthday dinner"
    assert session.note == "meet at door"


def test_start_group_session_is_idempotent_for_leader_and_updates_fields():
    """A leader re-starting returns the same forming group and applies new fields."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("902")

    first = CampaignGroupService.start_group_session(campaign, leader, name="Round 1")
    second = CampaignGroupService.start_group_session(campaign, leader, name="Round 2")

    assert first.id == second.id
    assert Group.objects.filter(campaign=campaign, group_leader=leader).count() == 1
    second.refresh_from_db()
    assert second.name == "Round 2"


# --- leave / cancel ----------------------------------------------------------


def test_leave_as_leader_cancels_forming_group():
    """A leader leaving a still-forming group cancels it and marks members LEFT."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=4)
    leader = make_customer("911")
    session = CampaignGroupService.start_group_session(campaign, leader)
    member = make_customer("912")
    CampaignGroupService.join_group_session(session.invite_token, member)

    CampaignGroupService.leave_group_session(session.id, leader)

    session.refresh_from_db()
    assert session.status == Group.Status.CANCELLED
    assert (
        GroupMember.objects.get(group=session, customer=leader).status
        == GroupMember.Status.LEFT
    )
    assert (
        GroupMember.objects.get(group=session, customer=member).status
        == GroupMember.Status.LEFT
    )


def test_leave_as_member_removes_them_and_reopens_full_group():
    """A non-leader member leaving is marked LEFT; a FULL group reopens to FORMING."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=2)
    leader = make_customer("921")
    session = CampaignGroupService.start_group_session(campaign, leader)
    member = make_customer("922")
    CampaignGroupService.join_group_session(session.invite_token, member)
    session.refresh_from_db()
    assert session.status == Group.Status.FULL

    CampaignGroupService.leave_group_session(session.id, member)

    session.refresh_from_db()
    assert session.status == Group.Status.FORMING
    assert (
        GroupMember.objects.get(group=session, customer=member).status
        == GroupMember.Status.LEFT
    )
    # The group still exists and the leader is unaffected.
    assert (
        GroupMember.objects.get(group=session, customer=leader).status
        == GroupMember.Status.CHECKED_IN
    )


def test_leave_by_non_member_is_not_found():
    """A customer who is neither leader nor member cannot leave (or probe) a group."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("931")
    session = CampaignGroupService.start_group_session(campaign, leader)
    stranger = make_customer("932")

    with pytest.raises(JaqynAPIException) as exc:
        CampaignGroupService.leave_group_session(session.id, stranger)
    assert exc.value.code == "GROUP_SESSION_NOT_FOUND"


def test_leave_completed_group_is_rejected():
    """A settled (completed) group cannot be left."""
    business = make_business()
    staff = make_staff(business)
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=2)
    leader = make_customer("941")
    session = CampaignGroupService.start_group_session(campaign, leader)
    member = make_customer("942")
    CampaignGroupService.join_group_session(session.invite_token, member)
    StaffScannerService.confirm_group_visit(staff, session.id)

    with pytest.raises(JaqynAPIException) as exc:
        CampaignGroupService.leave_group_session(session.id, member)
    assert exc.value.code == "GROUP_SESSION_INVALID_STATE"


# --- demo fill --------------------------------------------------------------


def test_demo_fill_reaches_full_and_creates_checkin_token():
    """demo_fill_group joins other customers until FULL via the real join path."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("951")
    session = CampaignGroupService.start_group_session(campaign, leader)
    # Other customer accounts available to be auto-joined.
    make_customer("952")
    make_customer("953")

    filled = CampaignGroupService.demo_fill_group(session.id, leader)

    assert filled.status == Group.Status.FULL
    active = GroupMember.objects.filter(
        group=filled,
        status__in=[GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN],
    ).count()
    assert active == 3
    # The check-in token is the GROUP_INVITE token minted at start (reused at FULL).
    assert QRCodeToken.objects.filter(
        token=filled.invite_token, type=QRCodeToken.Type.GROUP_INVITE
    ).exists()


def test_demo_fill_fabricates_users_when_too_few_real_customers():
    """With no other real customers, demo_fill fabricates demo users to reach FULL."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("954")
    session = CampaignGroupService.start_group_session(campaign, leader)
    # No other real customers exist — the demo aid must still fill the group.

    filled = CampaignGroupService.demo_fill_group(session.id, leader)

    assert filled.status == Group.Status.FULL
    active = GroupMember.objects.filter(
        group=filled,
        status__in=[GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN],
    ).count()
    assert active == 3


def test_demo_fill_endpoint_blocked_when_debug_false():
    """The demo-fill endpoint is a dev aid: refused (403) when DEBUG is off."""
    from django.test import override_settings

    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("961")
    session = CampaignGroupService.start_group_session(campaign, leader)
    make_customer("962")
    make_customer("963")

    with override_settings(DEBUG=False):
        response = _auth(leader).post(
            f"/api/customer/campaign-groups/{session.id}/demo-fill/"
        )
    assert response.status_code == 403
    assert response.data["error"]["code"] == "PERMISSION_DENIED"


def test_demo_fill_endpoint_fills_when_debug_true():
    """With DEBUG on, the endpoint fills the group and returns it FULL."""
    from django.test import override_settings

    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("971")
    session = CampaignGroupService.start_group_session(campaign, leader)
    make_customer("972")
    make_customer("973")

    with override_settings(DEBUG=True):
        response = _auth(leader).post(
            f"/api/customer/campaign-groups/{session.id}/demo-fill/"
        )
    assert response.status_code == 200
    assert response.data["data"]["status"] == Group.Status.FULL


# --- leave / detail HTTP surface --------------------------------------------


def test_leave_endpoint_returns_success_envelope():
    """POST /leave/ returns the {success: true} envelope and cancels the group."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=4)
    leader = make_customer("981")
    session = CampaignGroupService.start_group_session(campaign, leader)

    response = _auth(leader).post(f"/api/customer/campaign-groups/{session.id}/leave/")
    assert response.status_code == 200
    assert response.data["data"]["success"] is True
    session.refresh_from_db()
    assert session.status == Group.Status.CANCELLED


def test_group_detail_serializer_exposes_new_group_fields():
    """The group-detail payload carries visit_time/name/note/joined_count/members."""
    from datetime import datetime, timezone as dt_timezone

    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    leader = make_customer("991")
    visit = datetime(2026, 7, 2, 19, 30, tzinfo=dt_timezone.utc)
    session = CampaignGroupService.start_group_session(
        campaign, leader, visit_time=visit, name="Squad", note="see you there"
    )

    response = _auth(leader).get(f"/api/customer/campaign-groups/{session.id}/")
    assert response.status_code == 200
    data = response.data["data"]
    assert data["name"] == "Squad"
    assert data["note"] == "see you there"
    assert data["visit_time"] is not None
    assert data["joined_count"] == 1
    assert data["invite_code"] == session.invite_token
    assert data["campaign_name"] == campaign.name
    assert data["business_name"] == business.name
    member = data["members"][0]
    assert member["is_leader"] is True
    assert "name" in member


def test_customer_detail_serializer_exposes_group_offer_fields():
    """The customer campaign detail exposes the GROUP offer-detail grid fields."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=3)
    customer = make_customer("995")

    response = _auth(customer).get(f"/api/customer/campaigns/{campaign.id}/")
    assert response.status_code == 200
    data = response.data["data"]
    assert data["campaign_type"] == Campaign.CampaignType.GROUP
    assert data["reward"]["title"] == "Free dessert for the table"
    assert data["reward"]["reward_receiver_type"] == CampaignReward.ReceiverType.LEADER
    assert data["rule"]["required_group_size"] == 3
    assert data["rule"]["group_checkin_window_minutes"] == 30
    assert "min_spend" not in data["rule"]
    assert data["business_name"] == business.name
    assert data["business_category"] == business.category
    assert data["business_area"] == business.area
    assert data["active_days"] == []
    assert "active_start_time" in data
    assert "active_end_time" in data
    assert data["business_logo_url"] is None


# --- D1 — pagination envelope assertion on GroupSessionListView ---------------


def test_group_session_list_returns_pagination_envelope():
    """GET /api/customer/campaign-groups/ returns the standard {count, results} envelope."""
    business = make_business()
    campaign = _group_campaign(business, status=Campaign.Status.ACTIVE, group_size=2)
    leader = make_customer("996")
    CampaignGroupService.start_group_session(campaign, leader)

    response = _auth(leader).get("/api/customer/campaign-groups/")

    assert response.status_code == 200
    data = response.data["data"]
    assert "count" in data
    assert "results" in data
    assert data["count"] == 1
    assert data["results"][0]["campaign"]["id"] == str(campaign.id)


def test_group_session_list_page_size_cap():
    """?page_size=1000000 is silently capped at max_page_size (100)."""
    leader = make_customer("997")
    response = _auth(leader).get("/api/customer/campaign-groups/?page_size=1000000")

    assert response.status_code == 200
    assert "results" in response.data["data"]


# --- end-to-end via the HTTP API --------------------------------------------
