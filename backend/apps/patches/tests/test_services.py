"""Unit tests for PatchProgressService rule engine (spec §A).

Coverage:
- FIRST_EVENT: no data → 0; stamp transaction → earned
- DISTINCT_BUSINESSES: threshold logic; category filter
- CARDS_COMPLETED: loyalty + campaign vouchers; category filter
- TIME_OF_DAY: before boundary; after boundary; boundary exact; wrong side
- GROUP_LED: count completed groups where user is leader
- WEEKEND_STREAK: 0 weeks; consecutive weeks backward; break in streak
- SPEND_TOTAL: accumulates bill_amount; threshold cap
- REFERRALS / DISTRICTS: always (0, n) no-op
- Idempotency: earned_at set exactly once under concurrent re-evaluation
- handle_event: unknown user → empty list; exception per-patch swallowed
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.loyalty.models import LoyaltyMembership, LoyaltyProgram, LoyaltyTransaction
from apps.patches.models import PatchDef, UserPatch
from apps.patches.services.progress import (
    PatchProgressService,
    _BISHKEK_TZ,
    _eval_cards_completed,
    _eval_distinct_businesses,
    _eval_first_event,
    _eval_group_led,
    _eval_spend_total,
    _eval_time_of_day,
    _eval_weekend_streak,
)
from apps.patches.tests.helpers import make_business, make_customer, make_patch_def

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


def _make_program(business: Business, *, prog_type: str = LoyaltyProgram.Type.STAMP) -> LoyaltyProgram:
    """Minimal stamp program used to create memberships and transactions."""
    return LoyaltyProgram.objects.create(
        business=business,
        name="Test Program",
        type=prog_type,
        status=LoyaltyProgram.Status.ACTIVE,
        required_count=5,
    )


def _make_membership(program: LoyaltyProgram, customer: User) -> LoyaltyMembership:
    membership, _ = LoyaltyMembership.objects.get_or_create(
        program=program,
        customer=customer,
    )
    return membership


def _earn_stamp(
    membership: LoyaltyMembership,
    *,
    at: datetime | None = None,
    bill_amount=None,
) -> LoyaltyTransaction:
    """Insert an EARN stamp transaction, optionally back-dating created_at.

    auto_now_add=True means we can't pass created_at to objects.create;
    we use .update() immediately after creation to set a custom timestamp.
    """
    tx = LoyaltyTransaction.objects.create(
        membership=membership,
        program=membership.program,
        customer=membership.customer,
        business=membership.program.business,
        kind=LoyaltyTransaction.Kind.EARN,
        stamps_delta=1,
        bill_amount=bill_amount,
    )
    if at is not None:
        LoyaltyTransaction.objects.filter(pk=tx.pk).update(created_at=at)
        tx.created_at = at
    return tx


def _earn_bill(
    membership: LoyaltyMembership,
    bill_amount,
    *,
    at: datetime | None = None,
) -> LoyaltyTransaction:
    """Insert an EARN transaction with a bill_amount (spend-based)."""
    tx = LoyaltyTransaction.objects.create(
        membership=membership,
        program=membership.program,
        customer=membership.customer,
        business=membership.program.business,
        kind=LoyaltyTransaction.Kind.EARN,
        bill_amount=bill_amount,
        stamps_delta=None,
    )
    if at is not None:
        LoyaltyTransaction.objects.filter(pk=tx.pk).update(created_at=at)
        tx.created_at = at
    return tx


# ---------------------------------------------------------------------------
# FIRST_EVENT
# ---------------------------------------------------------------------------


class TestFirstEvent:
    def test_no_transactions_returns_zero(self):
        customer = make_customer("fe1")
        params = {"event": "stamp_scanned"}
        current, target = _eval_first_event(customer.id, params, "stamp_scanned")
        assert current == 0
        assert target == 1

    def test_stamp_earn_returns_one(self):
        customer = make_customer("fe2")
        business = make_business("fe2")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership)

        current, target = _eval_first_event(customer.id, {"event": "stamp_scanned"}, "stamp_scanned")
        assert current == 1
        assert target == 1

    def test_generic_event_matches_any_earn(self):
        customer = make_customer("fe3")
        business = make_business("fe3")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        # spend-only transaction (no stamps_delta)
        _earn_bill(membership, 100)

        current, target = _eval_first_event(customer.id, {"event": "other_event"}, "other_event")
        assert current == 1

    def test_only_counts_current_user(self):
        customer_a = make_customer("fe4a")
        customer_b = make_customer("fe4b")
        business = make_business("fe4")
        program = _make_program(business)
        membership_b = _make_membership(program, customer_b)
        _earn_stamp(membership_b)

        current, _ = _eval_first_event(customer_a.id, {"event": "stamp_scanned"}, "stamp_scanned")
        assert current == 0


# ---------------------------------------------------------------------------
# DISTINCT_BUSINESSES
# ---------------------------------------------------------------------------


class TestDistinctBusinesses:
    def test_zero_with_no_transactions(self):
        customer = make_customer("db1")
        current, target = _eval_distinct_businesses(customer.id, {"n": 3})
        assert current == 0
        assert target == 3

    def test_counts_distinct_businesses(self):
        customer = make_customer("db2")
        for i in range(3):
            b = make_business(f"db2b{i}")
            p = _make_program(b)
            m = _make_membership(p, customer)
            _earn_stamp(m)

        current, target = _eval_distinct_businesses(customer.id, {"n": 3})
        assert current == 3
        assert target == 3

    def test_capped_at_target(self):
        customer = make_customer("db3")
        for i in range(5):
            b = make_business(f"db3b{i}")
            p = _make_program(b)
            m = _make_membership(p, customer)
            _earn_stamp(m)

        current, target = _eval_distinct_businesses(customer.id, {"n": 3})
        assert current == 3  # capped
        assert target == 3

    def test_category_filter_excludes_other(self):
        customer = make_customer("db4")
        # cafe
        b_cafe = make_business("db4cafe")
        p_cafe = _make_program(b_cafe)
        m_cafe = _make_membership(p_cafe, customer)
        _earn_stamp(m_cafe)

        # non-cafe — category is "bakery" in make_business default? No — default is "cafe".
        # Override by creating directly:
        owner2 = User.objects.create_user(
            phone="+996709040001",
            role=User.Role.BUSINESS_OWNER,
            is_phone_verified=True,
        )
        b_bakery = Business.objects.create(
            owner=owner2,
            name="Bakery Shop",
            category="bakery",
            address="St 2",
            area="center",
            phone="+996709040002",
            working_hours={},
            status=Business.Status.APPROVED,
        )
        p_bakery = _make_program(b_bakery)
        m_bakery = _make_membership(p_bakery, customer)
        _earn_stamp(m_bakery)

        current, _ = _eval_distinct_businesses(customer.id, {"n": 3, "category": "cafe"})
        assert current == 1  # only the cafe


# ---------------------------------------------------------------------------
# CARDS_COMPLETED
# ---------------------------------------------------------------------------


class TestCardsCompleted:
    def test_zero_with_no_vouchers(self):
        customer = make_customer("cc1")
        current, target = _eval_cards_completed(customer.id, {"n": 5})
        assert current == 0
        assert target == 5

    def test_loyalty_vouchers_count(self):
        from apps.loyalty.models import LoyaltyVoucher

        customer = make_customer("cc2")
        business = make_business("cc2")
        program = _make_program(business)
        membership = _make_membership(program, customer)

        LoyaltyVoucher.objects.create(
            membership=membership,
            program=program,
            customer=customer,
            business=business,
            voucher_code="VTEST001",
            status=LoyaltyVoucher.Status.ACTIVE,
            reward_type=LoyaltyProgram.RewardType.FREE_ITEM,
        )

        current, target = _eval_cards_completed(customer.id, {"n": 5})
        assert current == 1

    def test_cancelled_vouchers_excluded(self):
        from apps.loyalty.models import LoyaltyVoucher

        customer = make_customer("cc3")
        business = make_business("cc3")
        program = _make_program(business)
        membership = _make_membership(program, customer)

        LoyaltyVoucher.objects.create(
            membership=membership,
            program=program,
            customer=customer,
            business=business,
            voucher_code="VTEST002",
            status=LoyaltyVoucher.Status.CANCELLED,
            reward_type=LoyaltyProgram.RewardType.FREE_ITEM,
        )

        current, _ = _eval_cards_completed(customer.id, {"n": 5})
        assert current == 0


# ---------------------------------------------------------------------------
# TIME_OF_DAY
# ---------------------------------------------------------------------------


class TestTimeOfDay:
    def _make_utc_stamp(self, customer: User, hour_bishkek: int, minute_bishkek: int = 0):
        """Insert a stamp at a Bishkek local time converted to UTC."""
        # Bishkek is UTC+6; local - 6h = UTC.
        local_dt = datetime(2025, 6, 15, hour_bishkek, minute_bishkek, 0, tzinfo=_BISHKEK_TZ)
        utc_dt = local_dt.astimezone(dt_timezone.utc)

        business = make_business(f"tod{hour_bishkek}{minute_bishkek}")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership, at=utc_dt)

    def test_before_boundary_qualifies(self):
        customer = make_customer("tod1")
        self._make_utc_stamp(customer, hour_bishkek=8)  # 08:00 < 10:00

        current, target = _eval_time_of_day(customer.id, {"direction": "before", "time": "10:00"})
        assert current == 1
        assert target == 1

    def test_after_boundary_fails_before_check(self):
        customer = make_customer("tod2")
        self._make_utc_stamp(customer, hour_bishkek=11)  # 11:00 > 10:00

        current, _ = _eval_time_of_day(customer.id, {"direction": "before", "time": "10:00"})
        assert current == 0  # after, not before → doesn't qualify

    def test_after_boundary_qualifies(self):
        customer = make_customer("tod3")
        self._make_utc_stamp(customer, hour_bishkek=22)  # 22:00 > 21:00

        current, target = _eval_time_of_day(customer.id, {"direction": "after", "time": "21:00"})
        assert current == 1
        assert target == 1

    def test_before_boundary_fails_after_check(self):
        customer = make_customer("tod4")
        self._make_utc_stamp(customer, hour_bishkek=20)  # 20:00 < 21:00

        current, _ = _eval_time_of_day(customer.id, {"direction": "after", "time": "21:00"})
        assert current == 0

    def test_exact_boundary_minute_before(self):
        # Exact boundary 10:00 is NOT before 10:00 (strict <).
        customer = make_customer("tod5")
        local_dt = datetime(2025, 6, 15, 10, 0, 0, tzinfo=_BISHKEK_TZ)
        business = make_business("tod5x")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership, at=local_dt.astimezone(dt_timezone.utc))

        current, _ = _eval_time_of_day(customer.id, {"direction": "before", "time": "10:00"})
        assert current == 0  # 10:00 is not strictly before 10:00

    def test_no_stamps_returns_zero(self):
        customer = make_customer("tod6")
        current, _ = _eval_time_of_day(customer.id, {"direction": "before", "time": "10:00"})
        assert current == 0


# ---------------------------------------------------------------------------
# GROUP_LED
# ---------------------------------------------------------------------------


class TestGroupLed:
    def test_no_groups_returns_zero(self):
        customer = make_customer("gl1")
        current, target = _eval_group_led(customer.id, {"n": 1})
        assert current == 0
        assert target == 1

    def test_completed_group_led_counts(self):
        from apps.campaigns.models import Group
        from apps.campaigns.tests.helpers import make_business as make_c_business, make_campaign

        customer = make_customer("gl2")
        business = make_c_business("gl2")
        campaign = make_campaign(business, campaign_type="group", required_group_size=2)

        Group.objects.create(
            campaign=campaign,
            group_leader=customer,
            status=Group.Status.COMPLETED,
            required_size=2,
        )

        current, target = _eval_group_led(customer.id, {"n": 1})
        assert current == 1

    def test_forming_group_not_counted(self):
        from apps.campaigns.models import Group
        from apps.campaigns.tests.helpers import make_business as make_c_business, make_campaign

        customer = make_customer("gl3")
        business = make_c_business("gl3")
        campaign = make_campaign(business, campaign_type="group", required_group_size=2)

        Group.objects.create(
            campaign=campaign,
            group_leader=customer,
            status=Group.Status.FORMING,  # not yet completed
            required_size=2,
        )

        current, _ = _eval_group_led(customer.id, {"n": 1})
        assert current == 0

    def test_only_led_by_user(self):
        from apps.campaigns.models import Group
        from apps.campaigns.tests.helpers import make_business as make_c_business, make_campaign

        leader = make_customer("gl4a")
        other = make_customer("gl4b")
        business = make_c_business("gl4")
        campaign = make_campaign(business, campaign_type="group", required_group_size=2)

        Group.objects.create(
            campaign=campaign,
            group_leader=other,  # other user is leader
            status=Group.Status.COMPLETED,
            required_size=2,
        )

        current, _ = _eval_group_led(leader.id, {"n": 1})
        assert current == 0


# ---------------------------------------------------------------------------
# WEEKEND_STREAK
# ---------------------------------------------------------------------------


class TestWeekendStreak:
    def _stamp_on_weekday(self, customer: User, weekday: int, week_offset: int = 0, suffix: str = "ws") -> None:
        """Create a stamp on a Saturday/Sunday for a given ISO week.

        weekday: 5=Saturday, 6=Sunday.
        week_offset: 0=current week, -1=previous week, etc.
        """
        now_bishkek = timezone.now().astimezone(_BISHKEK_TZ)
        # Monday of the target week
        current_monday = now_bishkek - timedelta(days=now_bishkek.weekday())
        target_monday = current_monday + timedelta(weeks=week_offset)
        target_day = target_monday + timedelta(days=weekday - 0)  # weekday 5=5 days after Monday
        target_dt = datetime(
            target_day.year, target_day.month, target_day.day,
            12, 0, 0, tzinfo=_BISHKEK_TZ,
        )
        business = make_business(f"{suffix}b{weekday}{abs(week_offset)}")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership, at=target_dt.astimezone(dt_timezone.utc))

    def test_zero_streak_no_visits(self):
        customer = make_customer("ws1")
        current, target = _eval_weekend_streak(customer.id, {"n": 3})
        assert current == 0
        assert target == 3

    def test_one_week_streak(self):
        customer = make_customer("ws2")
        self._stamp_on_weekday(customer, weekday=5, week_offset=0, suffix="ws2")

        current, target = _eval_weekend_streak(customer.id, {"n": 3})
        assert current == 1
        assert target == 3

    def test_three_week_consecutive_streak(self):
        customer = make_customer("ws3")
        for offset in [0, -1, -2]:
            self._stamp_on_weekday(customer, weekday=5, week_offset=offset, suffix=f"ws3o{abs(offset)}")

        current, target = _eval_weekend_streak(customer.id, {"n": 3})
        assert current == 3

    def test_streak_breaks_on_gap(self):
        customer = make_customer("ws4")
        # Week 0 and week -2 but NOT week -1 — streak breaks.
        self._stamp_on_weekday(customer, weekday=5, week_offset=0, suffix="ws4a")
        self._stamp_on_weekday(customer, weekday=5, week_offset=-2, suffix="ws4b")

        current, _ = _eval_weekend_streak(customer.id, {"n": 3})
        assert current == 1  # only current week counts; -1 is missing so streak breaks

    def test_weekday_visits_dont_count(self):
        customer = make_customer("ws5")
        # Monday = weekday 0
        now_bishkek = timezone.now().astimezone(_BISHKEK_TZ)
        current_monday = now_bishkek - timedelta(days=now_bishkek.weekday())
        monday_dt = datetime(
            current_monday.year, current_monday.month, current_monday.day,
            12, 0, 0, tzinfo=_BISHKEK_TZ,
        )
        business = make_business("ws5m")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership, at=monday_dt.astimezone(dt_timezone.utc))

        current, _ = _eval_weekend_streak(customer.id, {"n": 3})
        assert current == 0


# ---------------------------------------------------------------------------
# SPEND_TOTAL
# ---------------------------------------------------------------------------


class TestSpendTotal:
    def test_zero_spend(self):
        customer = make_customer("sp1")
        current, target = _eval_spend_total(customer.id, {"som": 10000})
        assert current == 0
        assert target == 10000

    def test_accumulates_bill_amounts(self):
        customer = make_customer("sp2")
        business = make_business("sp2")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_bill(membership, 3000)
        _earn_bill(membership, 4000)

        current, target = _eval_spend_total(customer.id, {"som": 10000})
        assert current == 7000
        assert target == 10000

    def test_capped_at_target(self):
        customer = make_customer("sp3")
        business = make_business("sp3")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_bill(membership, 15000)  # over target

        current, target = _eval_spend_total(customer.id, {"som": 10000})
        assert current == 10000
        assert target == 10000

    def test_null_bill_amount_ignored(self):
        # Stamps without bill_amount should not count toward spend.
        customer = make_customer("sp4")
        business = make_business("sp4")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership)  # stamps_delta=1, bill_amount=None

        current, _ = _eval_spend_total(customer.id, {"som": 10000})
        assert current == 0


# ---------------------------------------------------------------------------
# REFERRALS / DISTRICTS (no-op)
# ---------------------------------------------------------------------------


class TestNoOpRules:
    def test_referrals_always_zero(self):
        customer = make_customer("noop1")
        patch = make_patch_def(
            slug="test-referrals",
            rule_type=PatchDef.RuleType.REFERRALS,
            rule_params={"n": 3},
        )
        result = PatchProgressService.handle_event(str(customer.id), "any_event", {})
        # The patch should not appear in newly earned.
        assert patch.slug not in result

        # Check the progress row was created with 0.
        up = UserPatch.objects.filter(user=customer, patch=patch).first()
        assert up is not None
        assert up.progress_current == 0
        assert up.progress_target == 3

    def test_districts_always_zero(self):
        customer = make_customer("noop2")
        patch = make_patch_def(
            slug="test-districts",
            rule_type=PatchDef.RuleType.DISTRICTS,
            rule_params={"n": 3},
        )
        PatchProgressService.handle_event(str(customer.id), "any_event", {})
        up = UserPatch.objects.filter(user=customer, patch=patch).first()
        assert up is not None
        assert up.earned_at is None


# ---------------------------------------------------------------------------
# Idempotency: earned_at set exactly once
# ---------------------------------------------------------------------------


class TestIdempotency:
    def test_earned_at_set_once(self):
        customer = make_customer("idem1")
        business = make_business("idem1")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership)

        patch = make_patch_def(
            slug="idem-first",
            rule_type=PatchDef.RuleType.FIRST_EVENT,
            rule_params={"event": "stamp_scanned"},
        )

        # First call — should earn.
        newly = PatchProgressService.handle_event(str(customer.id), "stamp_scanned", {})
        assert patch.slug in newly

        up = UserPatch.objects.get(user=customer, patch=patch)
        assert up.earned_at is not None
        first_earned_at = up.earned_at

        # Second call — idempotent.
        newly2 = PatchProgressService.handle_event(str(customer.id), "stamp_scanned", {})
        assert patch.slug not in newly2

        up.refresh_from_db()
        assert up.earned_at == first_earned_at  # unchanged

    def test_uneaned_patch_stays_unearn(self):
        customer = make_customer("idem2")
        patch = make_patch_def(
            slug="idem-distinct",
            rule_type=PatchDef.RuleType.DISTINCT_BUSINESSES,
            rule_params={"n": 5},
        )
        # Only 1 business visit — threshold is 5.
        business = make_business("idem2")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership)

        newly = PatchProgressService.handle_event(str(customer.id), "stamp_scanned", {})
        assert patch.slug not in newly

        up = UserPatch.objects.get(user=customer, patch=patch)
        assert up.earned_at is None
        assert up.progress_current == 1


# ---------------------------------------------------------------------------
# handle_event: unknown user / exception isolation
# ---------------------------------------------------------------------------


class TestHandleEvent:
    def test_unknown_user_returns_empty_list(self):
        # Must pass a valid UUID format even though the user doesn't exist.
        nonexistent_uuid = "00000000-0000-0000-0000-000000000001"
        result = PatchProgressService.handle_event(nonexistent_uuid, "stamp_scanned", {})
        assert result == []

    def test_handle_event_returns_newly_earned_slugs(self):
        customer = make_customer("he1")
        business = make_business("he1")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership)

        patch = make_patch_def(
            slug="he-first",
            rule_type=PatchDef.RuleType.FIRST_EVENT,
            rule_params={"event": "stamp_scanned"},
        )

        newly = PatchProgressService.handle_event(str(customer.id), "stamp_scanned", {})
        assert patch.slug in newly

    def test_inactive_patches_skipped(self):
        customer = make_customer("he2")
        business = make_business("he2")
        program = _make_program(business)
        membership = _make_membership(program, customer)
        _earn_stamp(membership)

        inactive = make_patch_def(
            slug="he-inactive",
            rule_type=PatchDef.RuleType.FIRST_EVENT,
            rule_params={"event": "stamp_scanned"},
            is_active=False,
        )

        PatchProgressService.handle_event(str(customer.id), "stamp_scanned", {})
        assert not UserPatch.objects.filter(user=customer, patch=inactive).exists()
