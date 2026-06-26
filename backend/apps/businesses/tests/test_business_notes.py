"""Tests for the BusinessNote thread and the service hooks that write to it.

Covers:
- approve/reject/disable each append exactly one STATUS_CHANGE note carrying the
  acting admin and a snapshot of the status at write time.
- reject records its reason in the note body.
- request_business_changes flips onboarding_status and appends a
  CHANGES_REQUESTED note (the kind owners may see).
- add_business_note snapshots the current status into status_at_note.
"""
import pytest

from apps.accounts.models import User
from apps.businesses.models import Business, BusinessNote
from apps.businesses.services import (
    add_business_note,
    approve_business,
    disable_business,
    reject_business,
    request_business_changes,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_user():
    return User.objects.create(phone="+996700000001", name="Admin", role=User.Role.ADMIN)


@pytest.fixture
def business():
    return Business.objects.create(name="Manas Coffee", status=Business.Status.PENDING)


class TestStatusTransitionNotes:
    def test_approve_appends_status_change_note(self, business, admin_user):
        approve_business(business, admin_user)

        note = business.notes.get()
        assert note.kind == BusinessNote.Kind.STATUS_CHANGE
        assert note.author == admin_user
        # Snapshot reflects the status after the transition.
        assert note.status_at_note == Business.Status.APPROVED

    def test_reject_records_reason_in_note(self, business, admin_user):
        reject_business(business, admin_user, reason="Logo is too low-res")

        note = business.notes.get()
        assert note.kind == BusinessNote.Kind.STATUS_CHANGE
        assert "Logo is too low-res" in note.body
        assert note.status_at_note == Business.Status.REJECTED

    def test_disable_appends_status_change_note(self, business, admin_user):
        disable_business(business, admin_user)

        note = business.notes.get()
        assert note.kind == BusinessNote.Kind.STATUS_CHANGE
        assert note.status_at_note == Business.Status.DISABLED


class TestRequestChanges:
    def test_request_changes_sets_onboarding_status_and_appends_note(self, business, admin_user):
        request_business_changes(business, admin_user, reason="Add your opening hours")

        business.refresh_from_db()
        assert business.onboarding_status == Business.OnboardingStatus.CHANGES_REQUESTED

        note = business.notes.get()
        assert note.kind == BusinessNote.Kind.CHANGES_REQUESTED
        assert note.body == "Add your opening hours"
        assert note.author == admin_user

    def test_request_changes_defaults_body_when_no_reason(self, business, admin_user):
        request_business_changes(business, admin_user)

        assert business.notes.get().body == "Changes requested"


class TestAddBusinessNote:
    def test_snapshots_current_status(self, business, admin_user):
        note = add_business_note(business, body="Internal: chased owner by phone", author=admin_user)

        assert note.kind == BusinessNote.Kind.INTERNAL
        assert note.status_at_note == Business.Status.PENDING
        assert note.body == "Internal: chased owner by phone"
