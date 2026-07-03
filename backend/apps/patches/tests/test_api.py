"""API-surface tests for /api/customer/patches/ (spec §A).

Every endpoint gets:
  - auth test (401 without token)
  - permission test (403 for wrong role)
  - happy-path test

List endpoint also gets a query-count assertion via django_assert_num_queries.
"""

from __future__ import annotations

import pytest
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.patches.models import PatchBoardVisit, PatchDef, UserPatch
from apps.patches.tests.helpers import make_customer, make_patch_def

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def auth(user: User) -> APIClient:
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token  # type: ignore[attr-defined]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return client


def make_owner() -> User:
    return User.objects.create_user(
        phone="+99672000001",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
    )


# ---------------------------------------------------------------------------
# GET /api/customer/patches/ — patch list
# ---------------------------------------------------------------------------


class TestPatchListAuth:
    def test_requires_auth(self):
        response = APIClient().get("/api/customer/patches/")
        assert response.status_code == 401

    def test_rejects_business_owner(self):
        owner = make_owner()
        response = auth(owner).get("/api/customer/patches/")
        assert response.status_code == 403

    def test_allows_customer(self):
        customer = make_customer("api1")
        response = auth(customer).get("/api/customer/patches/")
        assert response.status_code == 200

    def test_happy_path_empty(self):
        customer = make_customer("api2")
        # Delete seeded defs so board is empty.
        PatchDef.objects.all().delete()
        response = auth(customer).get("/api/customer/patches/")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["earned_count"] == 0
        assert data["total"] == 0
        assert data["board_seen"] is False
        assert data["next"] is None
        assert data["patches"] == []
        assert data["unseen_earned"] == []

    def test_happy_path_with_patch_defs(self):
        customer = make_customer("api3")
        PatchDef.objects.all().delete()
        make_patch_def(slug="ap3-a", sort_order=0)
        make_patch_def(slug="ap3-b", sort_order=1)

        response = auth(customer).get("/api/customer/patches/")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["total"] == 2
        assert data["earned_count"] == 0
        slugs = [p["slug"] for p in data["patches"]]
        assert "ap3-a" in slugs
        assert "ap3-b" in slugs

    def test_inactive_patches_excluded(self):
        customer = make_customer("api4")
        PatchDef.objects.all().delete()
        make_patch_def(slug="ap4-active", is_active=True)
        make_patch_def(slug="ap4-inactive", is_active=False)

        response = auth(customer).get("/api/customer/patches/")
        data = response.json()["data"]
        assert data["total"] == 1
        assert data["patches"][0]["slug"] == "ap4-active"

    def test_earned_patch_shows_correct_flags(self):
        customer = make_customer("api5")
        patch = make_patch_def(slug="ap5-earn")
        UserPatch.objects.create(
            user=customer,
            patch=patch,
            progress_current=1,
            progress_target=1,
            earned_at=timezone.now(),
        )

        response = auth(customer).get("/api/customer/patches/")
        data = response.json()["data"]
        assert data["earned_count"] == 1

        p = next(p for p in data["patches"] if p["slug"] == "ap5-earn")
        assert p["earned"] is True
        assert p["earned_at"] is not None

    def test_unseen_earned_populated(self):
        customer = make_customer("api6")
        patch = make_patch_def(slug="ap6-earn")
        UserPatch.objects.create(
            user=customer,
            patch=patch,
            progress_current=1,
            progress_target=1,
            earned_at=timezone.now(),
            seen_at=None,  # not yet seen
        )

        response = auth(customer).get("/api/customer/patches/")
        data = response.json()["data"]
        assert len(data["unseen_earned"]) == 1
        assert data["unseen_earned"][0]["slug"] == "ap6-earn"

    def test_seen_patch_excluded_from_unseen(self):
        customer = make_customer("api7")
        patch = make_patch_def(slug="ap7-seen")
        UserPatch.objects.create(
            user=customer,
            patch=patch,
            progress_current=1,
            progress_target=1,
            earned_at=timezone.now(),
            seen_at=timezone.now(),  # already seen
        )

        response = auth(customer).get("/api/customer/patches/")
        data = response.json()["data"]
        assert len(data["unseen_earned"]) == 0

    def test_next_patch_is_closest_to_threshold(self):
        customer = make_customer("api8")
        p_far = make_patch_def(slug="ap8-far", sort_order=0)
        p_close = make_patch_def(slug="ap8-close", sort_order=1)

        # p_far: 0/5
        UserPatch.objects.create(
            user=customer, patch=p_far,
            progress_current=0, progress_target=5,
        )
        # p_close: 4/5 — higher ratio
        UserPatch.objects.create(
            user=customer, patch=p_close,
            progress_current=4, progress_target=5,
        )

        response = auth(customer).get("/api/customer/patches/")
        data = response.json()["data"]
        assert data["next"] is not None
        assert data["next"]["slug"] == "ap8-close"
        assert data["next"]["current"] == 4
        assert data["next"]["target"] == 5
        assert "to go" in data["next"]["remaining_label"]

    def test_board_seen_false_without_visit(self):
        customer = make_customer("api9")
        response = auth(customer).get("/api/customer/patches/")
        data = response.json()["data"]
        assert data["board_seen"] is False

    def test_board_seen_true_after_visit(self):
        customer = make_customer("api10")
        PatchBoardVisit.objects.create(
            user=customer,
            first_visited_at=timezone.now(),
        )
        response = auth(customer).get("/api/customer/patches/")
        data = response.json()["data"]
        assert data["board_seen"] is True

    def test_query_count(self, django_assert_num_queries):
        customer = make_customer("api11")
        for i in range(5):
            make_patch_def(slug=f"ap11-{i}", sort_order=i)

        client = auth(customer)
        # Expected: 1 user fetch (JWT resolves without DB), 1 all_defs, 1 user_patches, 1 board_seen
        with django_assert_num_queries(4):
            response = client.get("/api/customer/patches/")
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# POST /api/customer/patches/seen/
# ---------------------------------------------------------------------------


class TestMarkPatchesSeen:
    def test_requires_auth(self):
        response = APIClient().post("/api/customer/patches/seen/", {"slugs": ["x"]}, format="json")
        assert response.status_code == 401

    def test_rejects_business_owner(self):
        owner = make_owner()
        response = auth(owner).post(
            "/api/customer/patches/seen/", {"slugs": ["x"]}, format="json"
        )
        assert response.status_code == 403

    def test_happy_path_marks_seen(self):
        customer = make_customer("seen1")
        patch = make_patch_def(slug="seen1-a")
        UserPatch.objects.create(
            user=customer,
            patch=patch,
            progress_current=1,
            progress_target=1,
            earned_at=timezone.now(),
            seen_at=None,
        )

        response = auth(customer).post(
            "/api/customer/patches/seen/",
            {"slugs": [patch.slug]},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["marked"] == 1

        up = UserPatch.objects.get(user=customer, patch=patch)
        assert up.seen_at is not None

    def test_idempotent_second_call(self):
        customer = make_customer("seen2")
        patch = make_patch_def(slug="seen2-a")
        now = timezone.now()
        UserPatch.objects.create(
            user=customer,
            patch=patch,
            progress_current=1,
            progress_target=1,
            earned_at=now,
            seen_at=now,  # already seen
        )

        response = auth(customer).post(
            "/api/customer/patches/seen/",
            {"slugs": [patch.slug]},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["data"]["marked"] == 0  # already seen

    def test_unearned_patch_not_marked(self):
        customer = make_customer("seen3")
        patch = make_patch_def(slug="seen3-a")
        UserPatch.objects.create(
            user=customer,
            patch=patch,
            progress_current=0,
            progress_target=5,
            earned_at=None,
        )

        response = auth(customer).post(
            "/api/customer/patches/seen/",
            {"slugs": [patch.slug]},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["data"]["marked"] == 0

    def test_empty_slugs_rejected(self):
        customer = make_customer("seen4")
        response = auth(customer).post(
            "/api/customer/patches/seen/",
            {"slugs": []},
            format="json",
        )
        assert response.status_code == 400

    def test_unknown_slugs_ignored(self):
        customer = make_customer("seen5")
        response = auth(customer).post(
            "/api/customer/patches/seen/",
            {"slugs": ["does-not-exist"]},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["data"]["marked"] == 0


# ---------------------------------------------------------------------------
# POST /api/customer/patches/board-seen/
# ---------------------------------------------------------------------------


class TestMarkBoardSeen:
    def test_requires_auth(self):
        response = APIClient().post("/api/customer/patches/board-seen/", {}, format="json")
        assert response.status_code == 401

    def test_rejects_business_owner(self):
        owner = make_owner()
        response = auth(owner).post("/api/customer/patches/board-seen/", {}, format="json")
        assert response.status_code == 403

    def test_happy_path_creates_visit(self):
        customer = make_customer("bs1")
        assert not PatchBoardVisit.objects.filter(user=customer).exists()

        response = auth(customer).post("/api/customer/patches/board-seen/", {}, format="json")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["created"] is True
        assert PatchBoardVisit.objects.filter(user=customer).exists()

    def test_idempotent_second_call(self):
        customer = make_customer("bs2")
        PatchBoardVisit.objects.create(
            user=customer,
            first_visited_at=timezone.now(),
        )

        response = auth(customer).post("/api/customer/patches/board-seen/", {}, format="json")
        assert response.status_code == 200
        assert response.json()["data"]["created"] is False
        # Only one visit row still.
        assert PatchBoardVisit.objects.filter(user=customer).count() == 1

    def test_board_seen_reflected_in_list(self):
        customer = make_customer("bs3")

        # Before
        r1 = auth(customer).get("/api/customer/patches/")
        assert r1.json()["data"]["board_seen"] is False

        # Dismiss
        auth(customer).post("/api/customer/patches/board-seen/", {}, format="json")

        # After
        r2 = auth(customer).get("/api/customer/patches/")
        assert r2.json()["data"]["board_seen"] is True
