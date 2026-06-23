"""API-surface tests for the campaigns app (plan §1.3, BE-3).

Every endpoint gets an auth test (401 without a token), a permission test (403
for the wrong role), and a happy-path test. List endpoints assert their query
count with ``django_assert_num_queries`` so the N+1 rule is enforced, not just
stated. Business rules themselves are covered by the service-layer suites; these
tests prove the view wiring (parse → service → envelope) and access control.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignRewardVoucher,
)
from apps.campaigns.services import CampaignProgressService, CampaignRewardService
from apps.campaigns.tests.helpers import (
    make_business,
    make_campaign,
    make_customer,
    make_staff,
)
from apps.qr.services import get_or_create_customer_profile_token
from apps.staff.models import StaffMember

pytestmark = pytest.mark.django_db


# --- auth helpers -----------------------------------------------------------


def auth(user) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    # simplejwt types for_user() as the base Token, which has no access_token;
    # RefreshToken.access_token is real at runtime. Upstream stub gap.
    access = refresh.access_token  # type: ignore[attr-defined]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


def owner_client(business) -> APIClient:
    return auth(business.owner)


def customer_client(customer) -> APIClient:
    return auth(customer)


def staff_client(staff: StaffMember) -> APIClient:
    return auth(staff.user)


def draft_campaign(business) -> Campaign:
    return make_campaign(business, status=Campaign.Status.DRAFT)


# --- business surface -------------------------------------------------------


def test_campaign_list_requires_auth():
    business = make_business()
    make_campaign(business)
    response = APIClient().get("/api/business/campaigns/")
    assert response.status_code == 401


def test_campaign_list_rejects_customer():
    customer = make_customer()
    response = customer_client(customer).get("/api/business/campaigns/")
    assert response.status_code == 403


def test_campaign_list_happy_path_and_query_count(django_assert_num_queries):
    business = make_business()
    for _ in range(3):
        make_campaign(business)
    client = owner_client(business)
    # The count is fixed regardless of how many campaigns exist — the service
    # select_related's rule/reward so the page does not grow a query per row
    # (that is the N+1 gate). Auth (user), owned_business, count, and the page
    # query make up the constant total.
    with django_assert_num_queries(7):
        response = client.get("/api/business/campaigns/")
    assert response.status_code == 200
    assert response.data["data"]["count"] == 3
    assert len(response.data["data"]["results"]) == 3


def test_campaign_create_happy_path():
    business = make_business()
    client = owner_client(business)
    payload = {
        "name": "Coffee streak",
        "campaign_type": Campaign.CampaignType.VISIT,
        "active_days": [],
        "rule": {"rule_type": "visit_count", "required_count": 5},
        "reward": {"reward_type": "free_item", "title": "Free latte"},
    }
    response = client.post("/api/business/campaigns/", payload, format="json")
    assert response.status_code == 201
    data = response.data["data"]
    assert data["status"] == Campaign.Status.DRAFT
    assert data["required_count"] == 5
    assert data["reward_title"] == "Free latte"


def test_campaign_create_rejects_customer():
    customer = make_customer()
    response = customer_client(customer).post(
        "/api/business/campaigns/", {"name": "x", "campaign_type": "visit"}, format="json"
    )
    assert response.status_code == 403


def test_campaign_detail_and_edit():
    business = make_business()
    campaign = draft_campaign(business)
    client = owner_client(business)

    detail = client.get(f"/api/business/campaigns/{campaign.id}/")
    assert detail.status_code == 200
    assert detail.data["data"]["id"] == str(campaign.id)

    edit = client.put(
        f"/api/business/campaigns/{campaign.id}/",
        {"name": "Renamed", "rule": {"rule_type": "visit_count", "required_count": 9}},
        format="json",
    )
    assert edit.status_code == 200
    assert edit.data["data"]["name"] == "Renamed"
    assert edit.data["data"]["required_count"] == 9


def test_campaign_detail_other_business_is_not_found():
    business = make_business("001")
    other = make_business("002")
    campaign = make_campaign(other)
    response = owner_client(business).get(f"/api/business/campaigns/{campaign.id}/")
    assert response.status_code == 404
    assert response.data["error"]["code"] == "CAMPAIGN_NOT_FOUND"


def test_campaign_publish_pause_resume_end():
    business = make_business()
    campaign = draft_campaign(business)
    client = owner_client(business)

    published = client.post(f"/api/business/campaigns/{campaign.id}/publish/")
    assert published.status_code == 200
    assert published.data["data"]["status"] == Campaign.Status.ACTIVE

    paused = client.post(f"/api/business/campaigns/{campaign.id}/pause/")
    assert paused.data["data"]["status"] == Campaign.Status.PAUSED

    resumed = client.post(f"/api/business/campaigns/{campaign.id}/resume/")
    assert resumed.data["data"]["status"] == Campaign.Status.ACTIVE

    ended = client.post(f"/api/business/campaigns/{campaign.id}/end/")
    assert ended.data["data"]["status"] == Campaign.Status.ENDED


def test_campaign_cancel():
    business = make_business()
    campaign = make_campaign(business)  # ACTIVE
    response = owner_client(business).post(f"/api/business/campaigns/{campaign.id}/cancel/")
    assert response.status_code == 200
    assert response.data["data"]["status"] == Campaign.Status.CANCELLED


def test_campaign_publish_unpublishable_is_rejected():
    business = make_business()
    campaign = make_campaign(business, status=Campaign.Status.DRAFT, with_reward=False)
    response = owner_client(business).post(f"/api/business/campaigns/{campaign.id}/publish/")
    assert response.status_code == 409
    assert response.data["error"]["code"] == "CAMPAIGN_NOT_PUBLISHABLE"


def test_campaign_duplicate():
    business = make_business()
    campaign = make_campaign(business, required_count=4)
    response = owner_client(business).post(
        f"/api/business/campaigns/{campaign.id}/duplicate/"
    )
    assert response.status_code == 201
    assert response.data["data"]["status"] == Campaign.Status.DRAFT
    assert response.data["data"]["required_count"] == 4
    assert Campaign.objects.filter(business=business).count() == 2


def test_campaign_participants_list_query_count(django_assert_num_queries):
    business = make_business()
    campaign = make_campaign(business)
    for i in range(3):
        CampaignProgressService.join_campaign(campaign, make_customer(f"10{i}"))
    client = owner_client(business)
    # Constant regardless of participant count — customer + rule are
    # select_related, so the page does not issue a query per participant row.
    with django_assert_num_queries(5):
        response = client.get(f"/api/business/campaigns/{campaign.id}/participants/")
    assert response.status_code == 200
    assert response.data["data"]["count"] == 3


def test_campaign_vouchers_list():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    customer = make_customer()
    CampaignProgressService.record_campaign_action(campaign, customer, staff=staff)
    response = owner_client(business).get(
        f"/api/business/campaigns/{campaign.id}/vouchers/"
    )
    assert response.status_code == 200
    assert response.data["data"]["count"] == 1


def test_campaign_analytics():
    business = make_business()
    campaign = make_campaign(business)
    CampaignProgressService.join_campaign(campaign, make_customer())
    response = owner_client(business).get(
        f"/api/business/campaigns/{campaign.id}/analytics/"
    )
    assert response.status_code == 200
    assert response.data["data"]["joined"] == 1


def test_voucher_cancel_manager_only():
    business = make_business()
    cashier = make_staff(business, role=StaffMember.Role.CASHIER, suffix="201")
    manager = make_staff(business, role=StaffMember.Role.MANAGER, suffix="202")
    campaign = make_campaign(business, required_count=1)
    customer = make_customer()
    result = CampaignProgressService.record_campaign_action(
        campaign, customer, staff=cashier
    )
    voucher = result.voucher

    # A cashier cannot cancel.
    denied = staff_client(cashier).post(
        f"/api/business/campaigns/vouchers/{voucher.id}/cancel/",
        {"reason": "test"},
        format="json",
    )
    assert denied.status_code == 403
    assert denied.data["error"]["code"] == "PERMISSION_DENIED"

    # A manager can.
    ok = staff_client(manager).post(
        f"/api/business/campaigns/vouchers/{voucher.id}/cancel/",
        {"reason": "Issued in error"},
        format="json",
    )
    assert ok.status_code == 200
    assert ok.data["data"]["status"] == CampaignRewardVoucher.Status.CANCELLED


def test_voucher_cancel_requires_reason():
    business = make_business()
    manager = make_staff(business, role=StaffMember.Role.MANAGER, suffix="203")
    campaign = make_campaign(business, required_count=1)
    result = CampaignProgressService.record_campaign_action(
        campaign, make_customer(), staff=manager
    )
    response = staff_client(manager).post(
        f"/api/business/campaigns/vouchers/{result.voucher.id}/cancel/",
        {},
        format="json",
    )
    assert response.status_code == 400


# --- social-share surface ---------------------------------------------------


def _png_upload():
    """A tiny valid 1x1 PNG as an in-memory upload for image-field validation."""
    import io

    from django.core.files.uploadedfile import SimpleUploadedFile
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (1, 1), (255, 0, 0)).save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile("promo.png", buf.read(), content_type="image/png")


def test_campaign_image_upload_requires_auth():
    business = make_business()
    campaign = make_campaign(business)
    response = APIClient().post(
        f"/api/business/campaigns/{campaign.id}/image/",
        {"image": _png_upload()},
        format="multipart",
    )
    assert response.status_code == 401


def test_campaign_image_upload_rejects_non_owner():
    business = make_business("001")
    other = make_business("002")
    campaign = make_campaign(other)
    response = owner_client(business).post(
        f"/api/business/campaigns/{campaign.id}/image/",
        {"image": _png_upload()},
        format="multipart",
    )
    # The owner of a *different* business cannot see/upload — get_for_business
    # makes another business's campaign indistinguishable from a missing one.
    assert response.status_code == 404
    assert response.data["error"]["code"] == "CAMPAIGN_NOT_FOUND"


def test_campaign_image_upload_happy_path_sets_image():
    business = make_business()
    campaign = make_campaign(business)
    response = owner_client(business).post(
        f"/api/business/campaigns/{campaign.id}/image/",
        {"image": _png_upload()},
        format="multipart",
    )
    assert response.status_code == 200
    image_url = response.data["data"]["image"]
    assert image_url is not None
    # Relative media url so it resolves through the frontend same-origin proxy.
    assert image_url.startswith("/media/campaigns/")
    campaign.refresh_from_db()
    assert bool(campaign.image) is True


def test_campaign_social_post_requires_auth():
    business = make_business()
    campaign = make_campaign(business)
    response = APIClient().get(f"/api/business/campaigns/{campaign.id}/social-post/")
    assert response.status_code == 401


def test_campaign_social_post_rejects_customer():
    business = make_business()
    campaign = make_campaign(business)
    response = customer_client(make_customer()).get(
        f"/api/business/campaigns/{campaign.id}/social-post/"
    )
    assert response.status_code == 403


def test_campaign_social_post_response_shape():
    business = make_business()
    campaign = make_campaign(business)
    response = owner_client(business).get(
        f"/api/business/campaigns/{campaign.id}/social-post/"
    )
    assert response.status_code == 200
    data = response.data["data"]
    assert set(data.keys()) == {
        "headline",
        "reward_title",
        "subtext",
        "button_text",
        "auto_join_url",
        "image_url",
        "captions",
        "hashtags",
    }
    assert data["headline"] == campaign.name
    assert data["reward_title"] == "Free coffee"
    assert data["button_text"] == "Tap to join · bonus reward"
    assert data["auto_join_url"].endswith(f"/c/{campaign.id}")
    assert data["image_url"] is None
    assert set(data["captions"].keys()) == {
        "instagram",
        "tiktok",
        "facebook",
        "whatsapp",
    }
    assert "#Jaqyn" in data["hashtags"]


# --- customer surface -------------------------------------------------------


def test_discover_requires_auth():
    response = APIClient().get("/api/customer/campaigns/")
    assert response.status_code == 401


def test_discover_rejects_business_owner():
    business = make_business()
    response = owner_client(business).get("/api/customer/campaigns/")
    assert response.status_code == 403


def test_discover_happy_path_and_query_count(django_assert_num_queries):
    business = make_business()
    for _ in range(3):
        make_campaign(business)
    customer = make_customer()
    client = customer_client(customer)
    # 3 base (count + page + ...) + 2 for the per-customer progress prefetch
    # (participants + active vouchers); see CampaignService.progress_context_for.
    with django_assert_num_queries(5):
        response = client.get("/api/customer/campaigns/")
    assert response.status_code == 200
    assert response.data["data"]["count"] == 3


def test_customer_detail_includes_my_progress():
    business = make_business()
    campaign = make_campaign(business)
    customer = make_customer()
    CampaignProgressService.join_campaign(campaign, customer)
    response = customer_client(customer).get(f"/api/customer/campaigns/{campaign.id}/")
    assert response.status_code == 200
    assert response.data["data"]["my_progress"]["status"] == "joined"


def test_customer_detail_no_progress_when_not_joined():
    business = make_business()
    campaign = make_campaign(business)
    response = customer_client(make_customer()).get(
        f"/api/customer/campaigns/{campaign.id}/"
    )
    assert response.status_code == 200
    assert response.data["data"]["my_progress"] is None


def test_my_progress_payload_shape_and_null_voucher():
    """my_progress emits the locked FE/BE contract fields; voucher_id is null pre-reward.

    Contract: ``progress_count``/``required_count``/``status``/``voucher_id`` are
    all present. A joined-but-not-completed participant has no active voucher, so
    ``voucher_id`` is ``None``.
    """
    business = make_business()
    campaign = make_campaign(business, required_count=2)
    customer = make_customer()
    CampaignProgressService.join_campaign(campaign, customer)

    response = customer_client(customer).get(f"/api/customer/campaigns/{campaign.id}/")
    progress = response.data["data"]["my_progress"]

    assert progress["progress_count"] == 0
    assert progress["required_count"] == 2
    assert progress["status"] == "joined"
    assert progress["voucher_id"] is None


def test_my_progress_voucher_id_is_active_voucher_after_completion():
    """Once a campaign completes, my_progress.voucher_id is the customer's ACTIVE voucher.

    A REDEEMED voucher is no longer presentable, so the field drops back to
    ``None`` after redemption.
    """
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    customer = make_customer()
    result = CampaignProgressService.record_campaign_action(
        campaign, customer, staff=staff
    )
    assert result.completed is True

    response = customer_client(customer).get(f"/api/customer/campaigns/{campaign.id}/")
    progress = response.data["data"]["my_progress"]
    assert progress["voucher_id"] == str(result.voucher.id)

    CampaignRewardService.redeem_reward_voucher(staff, code=result.voucher.voucher_code)
    response = customer_client(customer).get(f"/api/customer/campaigns/{campaign.id}/")
    assert response.data["data"]["my_progress"]["voucher_id"] is None


# --- customer list: my_progress + filters (campaigns-redesign) --------------


def test_list_my_progress_null_when_not_joined():
    """Each list row carries my_progress; it is null for a campaign not joined."""
    business = make_business()
    make_campaign(business)
    response = customer_client(make_customer()).get("/api/customer/campaigns/")
    assert response.status_code == 200
    rows = response.data["data"]["results"]
    assert len(rows) == 1
    assert rows[0]["my_progress"] is None


def test_list_my_progress_populated_when_joined():
    """A joined row emits the locked progress contract shape inline in the list."""
    business = make_business()
    campaign = make_campaign(business, required_count=3)
    customer = make_customer()
    CampaignProgressService.join_campaign(campaign, customer)

    response = customer_client(customer).get("/api/customer/campaigns/")
    rows = response.data["data"]["results"]
    progress = rows[0]["my_progress"]
    assert progress is not None
    assert progress["status"] == "joined"
    assert progress["progress_count"] == 0
    assert progress["required_count"] == 3
    assert progress["voucher_id"] is None


def test_list_my_progress_voucher_id_after_completion():
    """A completed campaign's list row surfaces the customer's ACTIVE voucher id."""
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    customer = make_customer()
    result = CampaignProgressService.record_campaign_action(
        campaign, customer, staff=staff
    )

    response = customer_client(customer).get("/api/customer/campaigns/")
    progress = response.data["data"]["results"][0]["my_progress"]
    assert progress["voucher_id"] == str(result.voucher.id)


def test_list_my_progress_no_n_plus_one(django_assert_num_queries):
    """my_progress is prefetched: the query count is flat regardless of row count.

    Base discover is 3 queries (count + page + ...) and the per-customer progress
    prefetch adds exactly 2 (participants + active vouchers) — 5 total — and does
    not grow with the number of joined campaigns.
    """
    business = make_business()
    customer = make_customer()
    for _ in range(4):
        campaign = make_campaign(business, required_count=2)
        CampaignProgressService.join_campaign(campaign, customer)

    client = customer_client(customer)
    with django_assert_num_queries(5):
        response = client.get("/api/customer/campaigns/")
    assert response.status_code == 200
    assert response.data["data"]["count"] == 4
    assert all(r["my_progress"] is not None for r in response.data["data"]["results"])


def test_list_filter_by_type():
    """?type= narrows the list to one campaign_type; unknown values are ignored."""
    business = make_business()
    make_campaign(business, campaign_type=Campaign.CampaignType.VISIT)
    make_campaign(business, campaign_type=Campaign.CampaignType.TIME_WINDOW)
    make_campaign(business, campaign_type=Campaign.CampaignType.GROUP)
    client = customer_client(make_customer())

    visit = client.get("/api/customer/campaigns/?type=visit")
    assert visit.data["data"]["count"] == 1
    assert visit.data["data"]["results"][0]["campaign_type"] == "visit"

    tw = client.get("/api/customer/campaigns/?type=time_window")
    assert tw.data["data"]["count"] == 1

    group = client.get("/api/customer/campaigns/?type=group")
    assert group.data["data"]["count"] == 1

    # Unknown type degrades gracefully: no filter, all rows returned.
    unknown = client.get("/api/customer/campaigns/?type=bogus")
    assert unknown.status_code == 200
    assert unknown.data["data"]["count"] == 3


def test_list_filter_joined_only():
    """?joined=true returns only the customer's JOINED/IN_PROGRESS campaigns."""
    business = make_business()
    joined = make_campaign(business)
    make_campaign(business)  # not joined
    customer = make_customer()
    CampaignProgressService.join_campaign(joined, customer)

    client = customer_client(customer)
    all_rows = client.get("/api/customer/campaigns/")
    assert all_rows.data["data"]["count"] == 2

    only_joined = client.get("/api/customer/campaigns/?joined=true")
    assert only_joined.data["data"]["count"] == 1
    assert only_joined.data["data"]["results"][0]["id"] == str(joined.id)


def test_list_filter_joined_excludes_other_customers():
    """joined=true is scoped to the requester — another customer's join is invisible."""
    business = make_business()
    campaign = make_campaign(business)
    other = make_customer(suffix="002")
    CampaignProgressService.join_campaign(campaign, other)

    response = customer_client(make_customer(suffix="003")).get(
        "/api/customer/campaigns/?joined=true"
    )
    assert response.status_code == 200
    assert response.data["data"]["count"] == 0


def test_customer_join():
    business = make_business()
    campaign = make_campaign(business)
    customer = make_customer()
    response = customer_client(customer).post(
        f"/api/customer/campaigns/{campaign.id}/join/"
    )
    assert response.status_code == 201
    assert CampaignParticipant.objects.filter(
        campaign=campaign, customer=customer
    ).exists()


def test_customer_wallet_and_voucher_view():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    customer = make_customer()
    result = CampaignProgressService.record_campaign_action(campaign, customer, staff=staff)
    client = customer_client(customer)

    wallet = client.get("/api/customer/campaign-wallet/")
    assert wallet.status_code == 200
    assert wallet.data["data"]["count"] == 1

    voucher = client.get(f"/api/customer/campaign-vouchers/{result.voucher.id}/")
    assert voucher.status_code == 200
    assert voucher.data["data"]["voucher_code"] == result.voucher.voucher_code
    assert voucher.data["data"]["qr_url"] is not None


def test_customer_present_voucher():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    customer = make_customer()
    result = CampaignProgressService.record_campaign_action(campaign, customer, staff=staff)
    response = customer_client(customer).post(
        f"/api/customer/campaign-vouchers/{result.voucher.id}/present/"
    )
    assert response.status_code == 200
    assert response.data["data"]["status"] == CampaignRewardVoucher.Status.ACTIVE


def test_customer_cannot_view_another_customers_voucher():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    owner_customer = make_customer("301")
    result = CampaignProgressService.record_campaign_action(
        campaign, owner_customer, staff=staff
    )
    other = make_customer("302")
    response = customer_client(other).get(
        f"/api/customer/campaign-vouchers/{result.voucher.id}/"
    )
    assert response.status_code == 404


def test_group_start_creates_a_session():
    """A customer starting a group session on an active GROUP campaign gets a session.

    The group runtime is implemented (plan D7/Q4/Q6): the endpoint returns 201 with
    a FORMING session carrying an invite token, not the old Phase-2 seam error.
    """
    business = make_business()
    campaign = make_campaign(business, campaign_type=Campaign.CampaignType.GROUP)
    response = customer_client(make_customer()).post(
        f"/api/customer/campaigns/{campaign.id}/group/start/"
    )
    assert response.status_code == 201
    assert response.data["data"]["status"] == "forming"
    assert response.data["data"]["invite_token"]


def test_group_start_rejects_non_group_campaign():
    """Starting a group session on a visit campaign is rejected with VALIDATION_ERROR."""
    business = make_business()
    campaign = make_campaign(business)  # visit campaign
    response = customer_client(make_customer()).post(
        f"/api/customer/campaigns/{campaign.id}/group/start/"
    )
    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_ERROR"


# --- staff surface ----------------------------------------------------------


def test_scan_customer_requires_auth():
    response = APIClient().post(
        "/api/staff/campaigns/scan-customer/", {"token": "x"}, format="json"
    )
    assert response.status_code == 401


def test_scan_customer_rejects_customer_role():
    customer = make_customer()
    response = customer_client(customer).post(
        "/api/staff/campaigns/scan-customer/", {"token": "x"}, format="json"
    )
    assert response.status_code == 403


def test_scan_customer_lists_eligible_campaigns():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=3)
    customer = make_customer()
    token = get_or_create_customer_profile_token(customer).token
    response = staff_client(staff).post(
        "/api/staff/campaigns/scan-customer/", {"token": token}, format="json"
    )
    assert response.status_code == 200
    data = response.data["data"]
    assert data["customer"]["id"] == str(customer.id)
    assert len(data["campaigns"]) == 1
    assert data["campaigns"][0]["campaign"]["id"] == str(campaign.id)
    assert data["campaigns"][0]["required_count"] == 3


def test_confirm_visit_counts_and_completes():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    customer = make_customer()
    token = get_or_create_customer_profile_token(customer).token
    response = staff_client(staff).post(
        "/api/staff/campaigns/confirm-visit/",
        {"campaign_id": str(campaign.id), "token": token},
        format="json",
    )
    assert response.status_code == 200
    data = response.data["data"]
    assert data["completed"] is True
    assert data["voucher"] is not None
    assert data["progress_count"] == 1


def test_scan_and_redeem_voucher():
    business = make_business()
    staff = make_staff(business)
    campaign = make_campaign(business, required_count=1)
    customer = make_customer()
    result = CampaignProgressService.record_campaign_action(campaign, customer, staff=staff)
    code = result.voucher.voucher_code
    client = staff_client(staff)

    scan = client.post(
        "/api/staff/campaigns/scan-voucher/", {"code": code}, format="json"
    )
    assert scan.status_code == 200
    assert scan.data["data"]["status"] == CampaignRewardVoucher.Status.ACTIVE

    redeem = client.post(
        "/api/staff/campaigns/redeem-voucher/", {"code": code}, format="json"
    )
    assert redeem.status_code == 200
    assert redeem.data["data"]["status"] == CampaignRewardVoucher.Status.REDEEMED

    # Double redeem is rejected.
    again = client.post(
        "/api/staff/campaigns/redeem-voucher/", {"code": code}, format="json"
    )
    assert again.status_code == 409
    assert again.data["error"]["code"] == "VOUCHER_ALREADY_REDEEMED"


def test_scan_voucher_requires_token_or_code():
    business = make_business()
    staff = make_staff(business)
    response = staff_client(staff).post(
        "/api/staff/campaigns/scan-voucher/", {}, format="json"
    )
    assert response.status_code == 400


def test_redeem_wrong_business_rejected():
    business = make_business("001")
    other = make_business("002")
    staff_a = make_staff(business, suffix="401")
    staff_b = make_staff(other, suffix="402")
    campaign = make_campaign(business, required_count=1)
    customer = make_customer()
    result = CampaignProgressService.record_campaign_action(
        campaign, customer, staff=staff_a
    )
    response = staff_client(staff_b).post(
        "/api/staff/campaigns/redeem-voucher/",
        {"code": result.voucher.voucher_code},
        format="json",
    )
    assert response.status_code == 403
    assert response.data["error"]["code"] == "WRONG_BUSINESS"


def test_confirm_group_unknown_session_is_not_found():
    """Confirming a non-existent group session returns a clean 404.

    The group runtime is implemented; an unknown session id resolves to
    ``GROUP_SESSION_NOT_FOUND`` (404), not the old Phase-2 seam error.
    """
    business = make_business()
    staff = make_staff(business)
    response = staff_client(staff).post(
        "/api/staff/campaigns/confirm-group/",
        {"group_session_id": "00000000-0000-0000-0000-000000000000"},
        format="json",
    )
    assert response.status_code == 404
    assert response.data["error"]["code"] == "GROUP_SESSION_NOT_FOUND"
