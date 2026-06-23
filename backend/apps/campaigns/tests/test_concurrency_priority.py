"""Concurrency and §14 priority-resolver invariants (plan §1.6).

Two invariants the rest of the suite documents but does not pin:

* **Concurrency** — ``record_campaign_action`` re-runs the eligibility pipeline
  *under* the ``select_for_update`` lock, so two confirm-visits for the same
  single-visit (ONCE) campaign can never both count: the second observes the
  participant already COMPLETED and is rejected, and exactly one voucher is ever
  minted. The test settings use SQLite ``:memory:``, which serialises writes and
  does not share a connection across threads, so true thread-level Postgres lock
  contention is *not* exercisable here. We instead drive the contention path
  deterministically by invoking the action twice for the same ONCE campaign — the
  locked re-check is what rejects the second call, and that is the invariant.

* **§14 one-visit-one-campaign priority** — when one visit could count toward
  several eligible campaigns and none opts into ``allow_multiple_campaign_counting``,
  ``resolve_priority_campaign`` picks exactly one, applying the documented
  tie-break order (preferred → closest-to-complete → ending-soonest → newest).
  The preferred/closest cases live in ``test_progress.py``; here we pin the
  ending-soonest and newest tie-breaks and the default "exactly one" behaviour.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignRewardVoucher,
)
from apps.campaigns.services import (
    CampaignEligibilityService,
    CampaignProgressService,
)
from apps.campaigns.tests.helpers import make_business, make_campaign, make_customer
from core.exceptions import JaqynAPIException

pytestmark = pytest.mark.django_db


def _supports_for_update_of() -> bool:
    """True when the active DB backend supports ``select_for_update(of=...)``.

    Gates the real threaded contention test: only Postgres (and a few others)
    support row-level ``FOR UPDATE OF`` and real cross-connection locking. SQLite
    does not, so the threaded test is skipped there in favour of the deterministic
    stand-ins.
    """
    from django.db import connection

    return connection.features.has_select_for_update_of


# --- concurrency: locked re-check prevents a double count --------------------


def test_two_confirm_visits_count_once_and_issue_one_voucher():
    """A second visit on a completed ONCE campaign is rejected, not double-counted.

    ``record_campaign_action`` locks the participant row and re-runs the §13
    pipeline before incrementing. The first call completes the (required_count=1)
    campaign and flips the participant to COMPLETED; the second call's locked
    re-check sees ALREADY_COMPLETED and raises, so progress stays at 1 and only
    one voucher exists. This is the deterministic stand-in for two simultaneous
    confirm-visits — the lock + re-check is the invariant, and SQLite cannot model
    real thread contention (see module docstring).
    """
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(business, required_count=1)

    first = CampaignProgressService.record_campaign_action(campaign, customer)
    assert first.completed is True

    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(campaign, customer)
    assert exc.value.code == "CAMPAIGN_ALREADY_COMPLETED"

    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert participant.progress_count == 1
    assert (
        CampaignRewardVoucher.objects.filter(campaign=campaign, customer=customer).count()
        == 1
    )


def test_last_reward_slot_completion_is_serialised_under_the_campaign_lock():
    """Two final-slot completions on a max_rewards=1 campaign mint exactly one voucher.

    Reproduces the reward-cap race deterministically (plan §1.2 BLOCKER): two
    different customers both reach the final visit of a ``max_rewards=1`` campaign.
    The first ``record_campaign_action`` completes the campaign and mints the only
    voucher under the held ``Campaign`` row lock. The second customer passed the
    pre-increment eligibility cap check before that voucher existed (simulated here
    by recording them in sequence), but ``complete_campaign`` re-reads the cap under
    the campaign lock and now sees it reached, so it raises
    ``CAMPAIGN_REWARD_LIMIT_REACHED`` instead of overshooting. Exactly one voucher
    exists and ``max_rewards`` is never exceeded. SQLite serialises writes and
    cannot model true thread contention; the locked re-check is the invariant
    (see ``test_last_reward_slot_completion_is_threadsafe`` for the Postgres path).
    """
    business = make_business()
    campaign = make_campaign(
        business, required_count=1, max_rewards=1, minimum_gap=timedelta(0)
    )
    first_customer = make_customer("701")
    second_customer = make_customer("702")

    first = CampaignProgressService.record_campaign_action(campaign, first_customer)
    assert first.completed is True
    assert first.voucher is not None

    # The second customer's completion re-checks the cap under the campaign lock and
    # is rejected — the eligibility pipeline would also catch this, but this asserts
    # the locked re-check in complete_campaign is the backstop that holds the cap.
    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(campaign, second_customer)
    assert exc.value.code == "CAMPAIGN_REWARD_LIMIT_REACHED"

    assert CampaignRewardVoucher.objects.filter(campaign=campaign).count() == 1


def test_complete_campaign_rejects_over_cap_under_lock():
    """``complete_campaign`` raises when the cap is already full, even past eligibility.

    Directly pins the locked re-check that closes the race window the eligibility
    gate alone cannot: a customer can pass the pre-increment cap check, then have
    the last slot taken by a concurrent completer before they reach
    ``complete_campaign``. Here we fill the single reward slot first, then drive a
    second participant's completion directly — it must reject with
    ``CAMPAIGN_REWARD_LIMIT_REACHED`` and mint nothing, proving the cap holds at the
    mint boundary and not only at eligibility time.
    """
    business = make_business()
    campaign = make_campaign(
        business, required_count=1, max_rewards=1, minimum_gap=timedelta(0)
    )
    winner = make_customer("711")
    CampaignProgressService.record_campaign_action(campaign, winner)
    assert CampaignRewardVoucher.objects.filter(campaign=campaign).count() == 1

    # A second participant that already cleared the JOINED gate but completes after
    # the slot is gone. Build their participant row, then call complete_campaign
    # directly (the path record_campaign_action takes once progress is reached).
    loser = make_customer("712")
    participant = CampaignProgressService.join_campaign(campaign, loser)
    locked_campaign = CampaignProgressService._lock_campaign(campaign.id)
    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.complete_campaign(locked_campaign, participant, loser)
    assert exc.value.code == "CAMPAIGN_REWARD_LIMIT_REACHED"
    assert CampaignRewardVoucher.objects.filter(campaign=campaign).count() == 1


@pytest.mark.skipif(
    not _supports_for_update_of(),
    reason="Real thread-level lock contention needs a backend with "
    "select_for_update(of=...) (Postgres). The SQLite test DB serialises writes "
    "and shares no connection across threads — see the deterministic tests above.",
)
def test_last_reward_slot_completion_is_threadsafe():
    """Two threads completing the final slot concurrently mint exactly one voucher.

    The genuine race: two customers at the final visit of a ``max_rewards=1``
    campaign fire ``record_campaign_action`` from two threads at once. The
    ``Campaign`` row lock serialises them — one mints the voucher, the other's
    locked cap re-check rejects with ``CAMPAIGN_REWARD_LIMIT_REACHED``. Asserts the
    cap is never exceeded under true contention. Skipped on SQLite.
    """
    import threading

    from django.db import connections

    business = make_business()
    campaign = make_campaign(
        business, required_count=1, max_rewards=1, minimum_gap=timedelta(0)
    )
    a = make_customer("721")
    b = make_customer("722")
    CampaignProgressService.join_campaign(campaign, a)
    CampaignProgressService.join_campaign(campaign, b)

    barrier = threading.Barrier(2)
    errors: list[Exception] = []
    completed: list[bool] = []

    def run(customer):
        barrier.wait()
        try:
            result = CampaignProgressService.record_campaign_action(campaign, customer)
            completed.append(result.completed)
        except JaqynAPIException as exc:  # the loser of the race
            errors.append(exc)
        finally:
            connections.close_all()

    threads = [
        threading.Thread(target=run, args=(a,)),
        threading.Thread(target=run, args=(b,)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    # Exactly one completion succeeded; exactly one was rejected by the cap.
    assert completed.count(True) == 1
    assert len(errors) == 1
    assert errors[0].code == "CAMPAIGN_REWARD_LIMIT_REACHED"
    assert CampaignRewardVoucher.objects.filter(campaign=campaign).count() == 1


def test_two_visits_under_min_gap_count_once_on_a_multi_visit_campaign():
    """On a 3-visit campaign with a min-gap, a back-to-back second visit is blocked.

    Pins that the locked re-check guards a multi-step campaign too: the first
    visit counts (progress 1/3), the second within the min-gap window is rejected
    with ``CAMPAIGN_MIN_GAP`` and does not advance progress. No voucher is minted
    because the campaign is not yet complete.
    """
    business = make_business()
    customer = make_customer()
    campaign = make_campaign(
        business, required_count=3, minimum_gap=timedelta(minutes=30)
    )

    CampaignProgressService.record_campaign_action(campaign, customer)
    with pytest.raises(JaqynAPIException) as exc:
        CampaignProgressService.record_campaign_action(campaign, customer)
    assert exc.value.code == "CAMPAIGN_MIN_GAP"

    participant = CampaignParticipant.objects.get(campaign=campaign, customer=customer)
    assert participant.progress_count == 1
    assert not CampaignRewardVoucher.objects.filter(campaign=campaign).exists()


# --- §14 priority resolver: tie-breaks + default-one-campaign ----------------


def _evaluate(campaign: Campaign, customer):
    """Run the pipeline for a campaign + the customer's participant row (if any)."""
    participant = CampaignParticipant.objects.filter(
        campaign=campaign, customer=customer
    ).first()
    return CampaignEligibilityService.evaluate(campaign, customer.id, participant)


def test_priority_resolver_returns_exactly_one_campaign_by_default():
    """With several eligible campaigns and no opt-in, the resolver yields one.

    Two fresh eligible campaigns, equal progress (0/1), no preference: the
    resolver must still return a single :class:`Campaign` (the §14 default of one
    visit counting toward one campaign), never a list or ``None``.
    """
    business = make_business()
    customer = make_customer()
    c1 = make_campaign(business)
    c2 = make_campaign(business)

    results = [_evaluate(c1, customer), _evaluate(c2, customer)]
    chosen = CampaignProgressService.resolve_priority_campaign(results)

    assert isinstance(chosen, Campaign)
    assert chosen.id in {c1.id, c2.id}


def test_priority_resolver_prefers_ending_soonest_when_progress_tied():
    """Equal completion ratio → the campaign ending soonest wins (§14 tie-break 3).

    Both campaigns are fresh (0/5 progress), so the closest-to-complete tie-break
    cannot separate them; the resolver falls through to ``end_at`` and must pick
    the one ending sooner.
    """
    business = make_business()
    customer = make_customer()
    now = timezone.now()
    ends_later = make_campaign(
        business, required_count=5, end_at=now + timedelta(days=10)
    )
    ends_sooner = make_campaign(
        business, required_count=5, end_at=now + timedelta(days=2)
    )

    results = [_evaluate(ends_later, customer), _evaluate(ends_sooner, customer)]
    chosen = CampaignProgressService.resolve_priority_campaign(results)

    assert chosen.id == ends_sooner.id


def test_priority_resolver_falls_back_to_newest_when_no_end_dates():
    """Equal progress and no end dates → the most recently created campaign wins.

    With both completion ratio and ``end_at`` tied (no end set on either), the
    resolver's final tie-break is ``created_at`` newest-first. ``created_at`` is
    ``auto_now_add``; we rewrite it via a queryset ``update`` so the ordering is
    deterministic rather than dependent on creation microseconds.
    """
    business = make_business()
    customer = make_customer()
    older = make_campaign(business, required_count=5)
    newer = make_campaign(business, required_count=5)
    base = timezone.now()
    # Rewrite created_at deterministically (bypasses auto_now_add).
    Campaign.objects.filter(id=older.id).update(created_at=base - timedelta(days=2))
    Campaign.objects.filter(id=newer.id).update(created_at=base - timedelta(hours=1))
    older.refresh_from_db()
    newer.refresh_from_db()

    results = [_evaluate(older, customer), _evaluate(newer, customer)]
    chosen = CampaignProgressService.resolve_priority_campaign(results)

    assert chosen.id == newer.id


def test_priority_resolver_skips_ineligible_campaigns():
    """An ineligible campaign is never chosen even if it would win the tie-break.

    A paused campaign ending very soon must not be picked over an active one that
    ends later — eligibility gates the candidate set before any tie-break runs.
    """
    business = make_business()
    customer = make_customer()
    now = timezone.now()
    paused_ending_soon = make_campaign(
        business,
        status=Campaign.Status.PAUSED,
        required_count=5,
        end_at=now + timedelta(hours=1),
    )
    active_ending_later = make_campaign(
        business, required_count=5, end_at=now + timedelta(days=5)
    )

    results = [
        _evaluate(paused_ending_soon, customer),
        _evaluate(active_ending_later, customer),
    ]
    chosen = CampaignProgressService.resolve_priority_campaign(results)

    assert chosen.id == active_ending_later.id


def test_multiple_counting_opt_in_lets_one_visit_progress_two_campaigns():
    """``allow_multiple_campaign_counting`` lets a visit count toward each campaign.

    The §14 default is one-visit-one-campaign (enforced by the resolver at the
    scan surface). The per-campaign opt-in (plan Q3) means a campaign that sets
    ``allow_multiple_campaign_counting`` can have a visit recorded directly even
    while the customer is mid-progress on another campaign. Recording an action
    against each opted-in campaign advances both independently.
    """
    business = make_business()
    customer = make_customer()
    c1 = make_campaign(business, required_count=3)
    c2 = make_campaign(business, required_count=3)
    Campaign.objects.filter(id__in=[c1.id, c2.id]).update(
        allow_multiple_campaign_counting=True
    )
    c1.refresh_from_db()
    c2.refresh_from_db()

    CampaignProgressService.record_campaign_action(c1, customer)
    CampaignProgressService.record_campaign_action(c2, customer)

    p1 = CampaignParticipant.objects.get(campaign=c1, customer=customer)
    p2 = CampaignParticipant.objects.get(campaign=c2, customer=customer)
    assert p1.progress_count == 1
    assert p2.progress_count == 1
