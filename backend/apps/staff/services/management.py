"""Business-owner staff management service.

Owns all logic behind ``/api/business/staff/`` — the owner-facing "Manage Staff"
surface. Views stay thin: they resolve the owner's business, call one of these
functions, and shape the response. Every function here enforces business scoping
(an id from another business is invisible — treated as not found) and raises a
:class:`~core.exceptions.JaqynAPIException` subtype on failure rather than
returning an error sentinel.

The team list merges two record kinds into one shape (:class:`TeamRow`):

* ``StaffMember`` rows that are ACTIVE or SUSPENDED (real, possibly logged-in
  members), and
* ``StaffInvite`` rows that are still PENDING (people invited but not yet a
  member).

Performance: list aggregation is N+1-free. Per-staff stats (scans, redemptions,
signups, last-active) are computed with a handful of grouped aggregate queries
keyed by staff id, never one query per row. The query count is asserted in the
test suite (``django_assert_num_queries``).
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime

from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.db.models import Count, Max, Q
from django.utils import timezone

from rest_framework import status

from apps.accounts.models import User
from apps.businesses.models import Business, StaffInvite
from apps.campaigns.models import CampaignRewardVoucher
from apps.qr.models import ScanLog
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException

# Length (characters) of the one-time temporary password handed back by
# reset_staff_password. 16 url-safe chars ≈ 95 bits of entropy — comfortably
# above any brute-force concern for a credential the owner relays out-of-band
# and the staff member is expected to change. Not a stored value.
_TEMP_PASSWORD_LENGTH = 16


@dataclass(frozen=True)
class StaffStats:
    """Lifetime performance counters for one staff member.

    ``scans`` counts SUCCESS scan logs attributed to the member; ``redemptions``
    counts campaign vouchers redeemed by the member; ``signups`` is a
    best-effort count of distinct customers first seen through this member's
    successful scans (see :func:`_signup_counts` for the heuristic and its
    limits).
    """

    scans: int
    redemptions: int
    signups: int


@dataclass(frozen=True)
class TeamRow:
    """One row in the merged team list (a member or a pending invite).

    ``kind`` distinguishes a real ``StaffMember`` ("member") from a pending
    ``StaffInvite`` ("invite"). ``id`` is the underlying record's id as a string
    (member uuid/pk or invite uuid). ``access_label`` is derived from ``role``:
    manager → "Full access", anything else → "Scan & redeem". ``status`` is one
    of "active" | "invited" | "suspended". Timestamps are timezone-aware or
    ``None``.
    """

    id: str
    kind: str
    name: str
    role: str
    access_label: str
    email: str | None
    phone: str | None
    status: str
    last_active: datetime | None
    joined: datetime | None
    avatar_url: str | None
    initials: str
    stats: StaffStats


@dataclass(frozen=True)
class TeamCounts:
    """Headline counts for the team page header."""

    total: int
    active: int
    invited: int
    suspended: int


@dataclass(frozen=True)
class TeamList:
    """The full team payload: counts plus the merged, ordered rows."""

    counts: TeamCounts
    members: list[TeamRow]


# Role → human access label. Manager gets full management access; every other
# role (cashier today) is limited to the scan/redeem till flow. Source: product
# spec for the Manage Staff page. Keyed by the raw role string so both
# StaffMember.Role and StaffInvite.Role values resolve.
_MANAGER_ACCESS_LABEL = "Full access"  # spec: manager == full management access
_LIMITED_ACCESS_LABEL = "Scan & redeem"  # spec: cashier/other == till-only access


def _access_label(role: str) -> str:
    """Map a role to its access label, defaulting to the limited till label."""
    if role == StaffMember.Role.MANAGER:
        return _MANAGER_ACCESS_LABEL
    return _LIMITED_ACCESS_LABEL


def _initials(name: str | None) -> str:
    """Return up to two uppercase initials derived from a display name.

    Empty / blank names yield "?" so the UI always has a glyph to render.
    """
    parts = [p for p in (name or "").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][0].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _avatar_url(user) -> str | None:
    """Return the relative /media avatar URL for a user, or ``None``.

    Only a stored image avatar produces a URL; the emoji avatar is not a media
    file. Returns the relative URL (``.url``) so the caller can serve it behind
    its own media host without an absolute domain leaking in.
    """
    if user is None:
        return None
    avatar = getattr(user, "avatar", None)
    if not avatar:
        return None
    try:
        return avatar.url
    except ValueError:
        # No file associated despite a truthy field — treat as no avatar.
        return None


def _member_status(member: StaffMember) -> str:
    """ACTIVE members → "active"; deactivated members → "suspended"."""
    return "active" if member.is_active else "suspended"


def _scan_and_last_active(business: Business) -> dict[int, tuple[int, datetime | None]]:
    """Map staff_id → (success_scan_count, last_scan_at) for one business.

    One grouped aggregate over ``ScanLog`` — never a query per staff member.
    ``last_active`` is the most recent scan time regardless of status (any scan
    is activity); the count is restricted to SUCCESS scans.
    """
    rows = (
        ScanLog.objects.filter(business=business, staff__isnull=False)
        .values("staff_id")
        .annotate(
            scans=Count("id", filter=Q(status=ScanLog.Status.SUCCESS)),
            last_active=Max("created_at"),
        )
    )
    return {row["staff_id"]: (row["scans"], row["last_active"]) for row in rows}


def _redemption_counts(business: Business) -> dict[int, int]:
    """Map staff_id → campaign-voucher redemption count.

    One grouped aggregate over ``CampaignRewardVoucher``, keyed by the
    ``redeemed_by_staff`` FK, so there is no per-row query. Loyalty redemptions
    folded into campaign vouchers post-restructure (a loyalty card is now an
    INDIVIDUAL campaign), so this is the single source of redemption counts.
    """
    counts: dict[int, int] = {}
    campaign = (
        CampaignRewardVoucher.objects.filter(business=business, redeemed_by_staff__isnull=False)
        .values("redeemed_by_staff_id")
        .annotate(n=Count("id"))
    )
    for row in campaign:
        counts[row["redeemed_by_staff_id"]] = counts.get(row["redeemed_by_staff_id"], 0) + row["n"]
    return counts


def get_staff_for_user(user) -> StaffMember:
    """Return the user's active StaffMember, or raise ``PERMISSION_DENIED``.

    Relocated here from the deleted loyalty app (campaigns-restructure clean cut):
    resolving a StaffMember for a logged-in user belongs with the staff app.
    Selects the related business so callers can read ``staff.business`` without an
    extra query. Raises ``PERMISSION_DENIED`` (403) when the user has no active
    staff membership.
    """
    try:
        return user.staff_memberships.select_related("business").get(is_active=True)
    except StaffMember.DoesNotExist:
        raise JaqynAPIException("PERMISSION_DENIED", status_code=status.HTTP_403_FORBIDDEN)


def ensure_owner_staff(business: Business, *, active: bool = True) -> StaffMember | None:
    """Create/toggle the owner's own StaffMember row so they can work the till.

    An owner-operated shop's owner is its top staffer. This gives the owner a
    ``MANAGER`` StaffMember for their own business (no PIN — they authenticate as
    the user via JWT, not the shared-device PIN flow), which is what unlocks the
    staff interface for them (``get_staff_for_user`` and the ``staff`` area).

    Idempotent: the row is keyed on (business, owner) and reused on repeat calls;
    ``active`` flips ``is_active`` so the onboarding/settings toggle can enable or
    disable "owner works as staff" without deleting history. Returns the row, or
    None when the business has no owner yet (nothing to attach).
    """
    if business.owner_id is None:
        return None
    staff, created = StaffMember.objects.get_or_create(
        business=business,
        user=business.owner,
        defaults={
            "name": business.owner.name or "Owner",
            "role": StaffMember.Role.MANAGER,  # owner has full staff powers
            "is_active": active,
            "profile_completed": True,  # owner set up their profile during business onboarding
        },
    )
    if not created and staff.is_active != active:
        staff.is_active = active
        staff.save(update_fields=["is_active", "updated_at"])
    return staff


def _signup_counts(business: Business) -> dict[int, int]:
    """Map staff_id → distinct customers first seen via this staff's scans.

    Best-effort heuristic: count the distinct customers that appear on this
    staff member's SUCCESS scan logs. There is no first-touch attribution field
    on the data model, so this approximates "signups" as "distinct customers
    this member has successfully served". A customer served by two members
    counts for both; this is acceptable for a performance headline. If a cleaner
    attribution source is added later, swap the implementation here only.

    Computed with one grouped aggregate (distinct customer count per staff id),
    so it is N+1-free.
    """
    rows = (
        ScanLog.objects.filter(
            business=business,
            staff__isnull=False,
            customer__isnull=False,
            status=ScanLog.Status.SUCCESS,
        )
        .values("staff_id")
        .annotate(n=Count("customer_id", distinct=True))
    )
    return {row["staff_id"]: row["n"] for row in rows}


def _build_member_row(
    member: StaffMember,
    scans_by_staff: dict[int, tuple[int, datetime | None]],
    redemptions_by_staff: dict[int, int],
    signups_by_staff: dict[int, int],
) -> TeamRow:
    """Assemble a :class:`TeamRow` for one StaffMember from the aggregates."""
    scans, last_active = scans_by_staff.get(member.id, (0, None))
    user = member.user
    return TeamRow(
        id=str(member.id),
        kind="member",
        name=member.name,
        role=member.role,
        access_label=_access_label(member.role),
        email=user.email if user else None,
        phone=user.phone if user else None,
        status=_member_status(member),
        last_active=last_active,
        joined=member.created_at,
        avatar_url=_avatar_url(user),
        initials=_initials(member.name),
        stats=StaffStats(
            scans=scans,
            redemptions=redemptions_by_staff.get(member.id, 0),
            signups=signups_by_staff.get(member.id, 0),
        ),
    )


def _build_invite_row(invite: StaffInvite) -> TeamRow:
    """Assemble a :class:`TeamRow` for one pending StaffInvite.

    An invite has no scan history and no linked user yet, so stats are zero and
    last-active is ``None``. ``email``/``phone`` are split from the invite's
    single ``contact`` field: a value containing "@" is treated as an email,
    otherwise as a phone.
    """
    contact = invite.contact or ""
    is_email = "@" in contact
    name = invite.full_name or contact
    return TeamRow(
        id=str(invite.id),
        kind="invite",
        name=name,
        role=invite.role,
        access_label=_access_label(invite.role),
        email=contact if is_email else None,
        phone=None if is_email else (contact or None),
        status="invited",
        last_active=None,
        joined=invite.created_at,
        avatar_url=None,
        initials=_initials(name),
        stats=StaffStats(scans=0, redemptions=0, signups=0),
    )


def list_team(business: Business) -> TeamList:
    """Return the merged team list (members + pending invites) with counts.

    Merges ACTIVE/SUSPENDED ``StaffMember`` rows and PENDING ``StaffInvite``
    rows for ``business`` into one ordered list, newest first. Counts report
    total / active / invited / suspended. All per-staff stats are computed with
    grouped aggregates (no N+1).
    """
    members = list(
        StaffMember.objects.filter(business=business).select_related("user").order_by("-created_at")
    )
    invites = list(
        business.staff_invites.filter(status=StaffInvite.Status.PENDING).order_by("-created_at")
    )

    scans_by_staff = _scan_and_last_active(business)
    redemptions_by_staff = _redemption_counts(business)
    signups_by_staff = _signup_counts(business)

    member_rows = [
        _build_member_row(m, scans_by_staff, redemptions_by_staff, signups_by_staff) for m in members
    ]
    invite_rows = [_build_invite_row(i) for i in invites]

    rows = sorted(
        member_rows + invite_rows,
        key=lambda r: r.joined or timezone.now(),
        reverse=True,
    )

    active = sum(1 for r in member_rows if r.status == "active")
    suspended = sum(1 for r in member_rows if r.status == "suspended")
    invited = len(invite_rows)
    counts = TeamCounts(
        total=len(member_rows) + invited,
        active=active,
        invited=invited,
        suspended=suspended,
    )
    return TeamList(counts=counts, members=rows)


def get_staff_member(business: Business, staff_id: str) -> StaffMember:
    """Return one StaffMember scoped to ``business``, or raise NOT_FOUND.

    Cross-business ids are indistinguishable from missing ids (both 404) so an
    owner can never probe another business's staff ids.
    """
    member = (
        StaffMember.objects.select_related("user")
        .filter(business=business, id=staff_id)
        .first()
    )
    if member is None:
        raise JaqynAPIException("NOT_FOUND", "Staff member not found", status_code=404)
    return member


def get_staff_detail(business: Business, staff_id: str) -> TeamRow:
    """Return the full :class:`TeamRow` for one member of ``business``.

    Reuses the same aggregates as :func:`list_team` so detail and list rows are
    identical in shape and derivation. Raises NOT_FOUND for unknown / cross-
    business ids.
    """
    member = get_staff_member(business, staff_id)
    scans_by_staff = _scan_and_last_active(business)
    redemptions_by_staff = _redemption_counts(business)
    signups_by_staff = _signup_counts(business)
    return _build_member_row(member, scans_by_staff, redemptions_by_staff, signups_by_staff)


def change_role(business: Business, staff_id: str, role: str) -> StaffMember:
    """Set a staff member's role. Validates enum membership.

    ``role`` must be a member of ``StaffMember.Role``; an unknown value raises
    VALIDATION_ERROR. Returns the updated member.
    """
    if role not in StaffMember.Role.values:
        raise JaqynAPIException("VALIDATION_ERROR", "Invalid role", status_code=400)
    member = get_staff_member(business, staff_id)
    member.role = role
    member.save(update_fields=["role", "updated_at"])
    return member


def set_active(business: Business, staff_id: str, *, is_active: bool) -> StaffMember:
    """Suspend (``is_active=False``) or reactivate (``True``) a staff member.

    Idempotent: setting the state it already has is a no-op that still returns
    the member. Raises NOT_FOUND for unknown / cross-business ids.
    """
    member = get_staff_member(business, staff_id)
    if member.is_active != is_active:
        member.is_active = is_active
        member.save(update_fields=["is_active", "updated_at"])
    return member


def reset_staff_password(business: Business, staff_id: str) -> str:
    """Generate a strong temporary password for the member's linked user.

    Sets the password on the staff member's linked ``User`` and returns the
    plaintext **once** so the caller can relay it. The plaintext is never stored
    or logged — only its hash is persisted via ``set_password``. Wrapped in a
    transaction because it is a credential mutation.

    Raises NO_LINKED_USER (409) if the staff member has no linked user yet
    (still effectively an invite), since there is no credential to reset.
    """
    member = get_staff_member(business, staff_id)
    if member.user is None:
        raise JaqynAPIException(
            "NO_LINKED_USER",
            "This staff member has no login yet",
            status_code=409,
        )
    temp_password = secrets.token_urlsafe(_TEMP_PASSWORD_LENGTH)
    with transaction.atomic():
        user = member.user
        user.password = make_password(temp_password)
        user.save(update_fields=["password"])
    return temp_password


def create_staff_account(
    business: Business, phone: str, role: str, name: str = ""
) -> tuple[StaffMember, str]:
    """Create a staff login for ``business`` and return (member, one-time password).

    Owner-driven, invite-free staff creation. Creates (or reuses) the ``User``
    keyed on ``phone`` with role STAFF, sets an auto-generated password, and
    creates an active ``StaffMember`` with ``profile_completed=False`` so the
    staffer completes their own profile on first login. The plaintext password is
    returned exactly once for the owner to relay; only its hash is persisted.

    Raises ``CONFLICT`` (409) if the user already has an active membership in this
    business. Wrapped in a transaction because it creates an account + credential.
    """
    temp_password = secrets.token_urlsafe(_TEMP_PASSWORD_LENGTH)
    with transaction.atomic():
        user, _created = User.objects.get_or_create(
            phone=phone, defaults={"role": User.Role.STAFF}
        )
        if user.staff_memberships.filter(business=business, is_active=True).exists():
            raise JaqynAPIException(
                "CONFLICT", "This person is already on your team", status_code=409
            )
        user.role = User.Role.STAFF
        user.password = make_password(temp_password)
        user.save(update_fields=["role", "password", "updated_at"])
        member = StaffMember.objects.create(
            business=business,
            user=user,
            name=name or (user.name or ""),
            role=role,
            is_active=True,
            profile_completed=False,
        )
    return member, temp_password


def remove_staff_member(business: Business, staff_id: str) -> None:
    """Delete a staff member from ``business``.

    Deactivates the linked user's staff role is *not* performed here — the
    ``User`` may own other memberships and its account is managed elsewhere; we
    only remove the membership record. Pending invites are removed via the
    existing invite endpoint, not here. Raises NOT_FOUND for unknown / cross-
    business ids.
    """
    member = get_staff_member(business, staff_id)
    member.delete()
