"""Group-campaign session runtime (plan §11 / D7 / Q4 / Q6 — group is in MVP).

Owns the real GROUP loop: a leader starts a session (minting a GROUP_INVITE QR
token), members join via that token, and a staff member confirms the coordinated
check-in. On a valid confirmation the session is marked COMPLETED and **exactly
one** reward voucher is issued to the *leader* (plan Q4 — leader gets the single
voucher), reusing :class:`CampaignRewardService` and the same reward-cap re-check
the visit path uses.

Contention is handled the same way as the visit path: the ``Campaign`` row is
locked first, then the ``Group`` row, in that fixed order, so the
single-voucher mint is serialised and the reward cap can never be overshot. The
leader's reward notification is scheduled only via ``transaction.on_commit`` (the
non-negotiable Celery-with-Postgres rule).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.db import connection, transaction
from django.utils import timezone
from rest_framework import status

from apps.campaigns.constants import (
    DEFAULT_GROUP_CHECKIN_WINDOW_MINUTES,
    DEFAULT_REQUIRED_GROUP_SIZE,
)
from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignRewardVoucher,
    Group,
    GroupMember,
)
from apps.campaigns.services.eligibility import CampaignEligibilityService
from apps.campaigns.services.progress import (
    CampaignProgressService,
    _schedule_reward_notification,
)
from apps.campaigns.services.rewards import CampaignRewardService
from apps.qr.models import QRCodeToken
from apps.qr.services import create_token
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException
from core.logging import emit_event


@dataclass(frozen=True)
class GroupConfirmResult:
    """Outcome of a staff confirming a group check-in (plan §11).

    ``session`` is the now-COMPLETED session; ``voucher`` is the single leader
    voucher minted on confirmation. ``member_count`` is how many members were
    checked in (leader included) so the staff UI can show "4 / 4 confirmed".
    """

    session: Group
    voucher: CampaignRewardVoucher
    member_count: int


class CampaignGroupService:
    """Run group-campaign sessions end to end (plan §11 / Q4 / Q6).

    The contention-sensitive entry point is :meth:`confirm_group_visit`, which
    mints the single leader voucher under a ``Campaign`` → ``Group`` lock
    ordering so a double-confirm cannot mint two vouchers.
    """

    @staticmethod
    def _required_group_size(campaign: Campaign) -> int:
        """Return the group size that completes the campaign (plan §11).

        Reads ``CampaignRule.required_group_size``; falls back to
        ``DEFAULT_REQUIRED_GROUP_SIZE`` (2) when a GROUP campaign does not set one.
        """
        rule = getattr(campaign, "rule", None)
        if rule is not None and rule.required_group_size:
            return rule.required_group_size
        return DEFAULT_REQUIRED_GROUP_SIZE

    @staticmethod
    def _checkin_window_minutes(campaign: Campaign) -> int:
        """Return the check-in window in minutes for a group session (plan §11).

        Reads ``CampaignRule.group_checkin_window_minutes``; falls back to
        ``DEFAULT_GROUP_CHECKIN_WINDOW_MINUTES`` (30) when unset. The window bounds
        how long a forming session stays valid before it expires.
        """
        rule = getattr(campaign, "rule", None)
        if rule is not None and rule.group_checkin_window_minutes:
            return rule.group_checkin_window_minutes
        return DEFAULT_GROUP_CHECKIN_WINDOW_MINUTES

    @staticmethod
    def _lock_campaign(campaign_id) -> Campaign:
        """Re-fetch a campaign ``select_for_update`` (Campaign-row-only) with relations.

        Mirrors ``CampaignProgressService._lock_campaign`` so the group path and the
        visit path take the *same* campaign lock in the *same* way — the consistent
        ordering across both paths is what prevents a deadlock when they contend.
        """
        queryset = Campaign.objects.select_related("rule", "reward")
        if connection.features.has_select_for_update_of:
            queryset = queryset.select_for_update(of=("self",))
        else:
            queryset = queryset.select_for_update()
        return queryset.get(id=campaign_id)

    @classmethod
    def start_group_session(
        cls,
        campaign: Campaign,
        leader,
        now: datetime | None = None,
        visit_time: datetime | None = None,
        name: str = "",
        note: str = "",
    ) -> Group:
        """Start a group session for a leader, minting the GROUP_INVITE token (§11).

        Rejects a non-GROUP campaign (``VALIDATION_ERROR``) or a campaign that is
        not ACTIVE (``CAMPAIGN_NOT_ACTIVE``). Creates a FORMING :class:`Group`
        whose ``required_size`` is the rule's group size and whose ``expires_at`` is
        ``now`` plus the check-in window, mints a ``GROUP_INVITE`` QR token whose
        value is the session's ``invite_token`` (members join by scanning it), and
        enrols the leader as the first ``GroupMember`` (CHECKED_IN — the
        leader is present by definition). The leader is also auto-joined as a
        :class:`CampaignParticipant` so the reward can attach to their row on
        completion. Runs in one atomic block.

        The optional ``visit_time`` (leader-chosen slot), ``name`` (group label),
        and ``note`` (message to invited friends) are persisted on the group when
        supplied. **Idempotent for the leader:** if the leader already leads a
        non-terminal (FORMING/FULL/CHECKING_IN) group for this campaign, that group
        is returned instead of creating a second one, and any supplied
        ``visit_time``/``name``/``note`` updates it in place.
        """
        now = now or timezone.now()
        if campaign.campaign_type != Campaign.CampaignType.GROUP:
            raise JaqynAPIException(
                "VALIDATION_ERROR",
                "Only a group campaign can start a group session",
                status.HTTP_400_BAD_REQUEST,
            )
        if campaign.status != Campaign.Status.ACTIVE:
            raise JaqynAPIException(
                "CAMPAIGN_NOT_ACTIVE", status_code=status.HTTP_409_CONFLICT
            )

        # Non-terminal statuses: a leader still actively running a group should not
        # spawn a duplicate. Terminal (COMPLETED/EXPIRED/CANCELLED) groups do not
        # block a fresh start.
        active_statuses = {
            Group.Status.FORMING,
            Group.Status.FULL,
            Group.Status.CHECKING_IN,
        }
        existing = (
            Group.objects.filter(
                campaign=campaign,
                group_leader=leader,
                status__in=active_statuses,
            )
            .order_by("-created_at")
            .first()
        )
        if existing is not None:
            updated_fields: list[str] = []
            if visit_time is not None:
                existing.visit_time = visit_time
                updated_fields.append("visit_time")
            if name:
                existing.name = name
                updated_fields.append("name")
            if note:
                existing.note = note
                updated_fields.append("note")
            if updated_fields:
                updated_fields.append("updated_at")
                existing.save(update_fields=updated_fields)
            return existing

        required_size = cls._required_group_size(campaign)
        window = cls._checkin_window_minutes(campaign)
        with transaction.atomic():
            token = create_token(
                QRCodeToken.Type.GROUP_INVITE,
                business=campaign.business,
                customer=leader,
                campaign=campaign.id,
                expires_at=now + timedelta(minutes=window),
            )
            session = Group.objects.create(
                campaign=campaign,
                group_leader=leader,
                status=Group.Status.FORMING,
                required_size=required_size,
                invite_token=token.token,
                visit_time=visit_time,
                name=name,
                note=note,
                expires_at=now + timedelta(minutes=window),
            )
            # The leader is a participant so the reward attaches to a real row on
            # completion; they are present, so they are CHECKED_IN from the start.
            CampaignProgressService.join_campaign(campaign, leader)
            GroupMember.objects.create(
                group=session,
                customer=leader,
                status=GroupMember.Status.CHECKED_IN,
                joined_at=now,
                checked_in_at=now,
            )

        emit_event(
            "campaign_group_started",
            business_id=str(campaign.business_id),
            campaign_id=str(campaign.id),
            customer_id=str(leader.id),
            group_id=str(session.id),
        )
        return session

    @classmethod
    def join_group_session(
        cls,
        invite_token: str,
        customer,
        now: datetime | None = None,
    ) -> GroupMember:
        """Join a forming group session via its invite token (§11, idempotent).

        Resolves the session by ``invite_token`` (``GROUP_SESSION_NOT_FOUND`` if no
        match). Rejects a session that is not FORMING (``GROUP_SESSION_INVALID_STATE``)
        or already at ``required_size`` (``GROUP_SESSION_FULL``). The leader joining
        their own session, or a member joining twice, returns the existing member
        row unchanged (idempotent). Locks the session row while counting members so
        two simultaneous joins cannot both take the last slot. A new member is
        recorded JOINED; the staff confirm step checks them in.
        """
        now = now or timezone.now()
        with transaction.atomic():
            session = (
                Group.objects.select_for_update()
                .select_related("campaign")
                .filter(invite_token=invite_token)
                .first()
            )
            if session is None:
                raise JaqynAPIException(
                    "GROUP_SESSION_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
                )
            existing = GroupMember.objects.filter(
                group=session, customer=customer
            ).first()
            if existing is not None:
                return existing
            if session.status != Group.Status.FORMING:
                raise JaqynAPIException(
                    "GROUP_SESSION_INVALID_STATE",
                    status_code=status.HTTP_409_CONFLICT,
                )
            member_count = GroupMember.objects.filter(group=session).count()
            if member_count >= session.required_size:
                raise JaqynAPIException(
                    "GROUP_SESSION_FULL", status_code=status.HTTP_409_CONFLICT
                )
            member = GroupMember.objects.create(
                group=session,
                customer=customer,
                status=GroupMember.Status.JOINED,
                joined_at=now,
            )
            # Reaching the required size flips the session to FULL so late joiners
            # are rejected; it is not yet COMPLETED — staff confirmation does that.
            if member_count + 1 >= session.required_size:
                session.status = Group.Status.FULL
                session.save(update_fields=["status", "updated_at"])

        emit_event(
            "campaign_group_joined",
            business_id=str(session.campaign.business_id),
            campaign_id=str(session.campaign_id),
            customer_id=str(customer.id),
            group_id=str(session.id),
        )
        return member

    @classmethod
    def confirm_group_visit(
        cls,
        staff: StaffMember,
        group_id,
        now: datetime | None = None,
    ) -> GroupConfirmResult:
        """Confirm a group check-in and issue the single leader voucher (§11 / Q4).

        The coordinated MVP confirmation: the staff member confirms the whole table
        at once. Loads the session and asserts it belongs to the staff member's
        business (``WRONG_BUSINESS``). Locks the ``Campaign`` row first, then the
        ``Group`` row (the fixed Campaign → session order that prevents a
        deadlock with the visit path). Validates the session has not expired past
        ``expires_at`` / the check-in window (``GROUP_SESSION_INVALID_STATE``) and
        has reached ``required_size`` (``GROUP_SESSION_FULL`` reason reused for the
        not-yet-full case as ``GROUP_SESSION_INVALID_STATE``). Marks every JOINED
        member CHECKED_IN, sets the session COMPLETED, and mints **exactly one**
        voucher for the leader via ``CampaignRewardService.issue_reward_voucher``
        after re-checking the reward cap under the campaign lock
        (``CAMPAIGN_REWARD_LIMIT_REACHED`` if full). A second confirm sees the
        session already COMPLETED and is rejected (``GROUP_SESSION_INVALID_STATE``),
        so the leader can never get two vouchers. Schedules the reward-unlocked
        notification via ``transaction.on_commit``.
        """
        now = now or timezone.now()
        session = (
            Group.objects.select_related("campaign", "campaign__reward")
            .filter(id=group_id)
            .first()
        )
        if session is None:
            raise JaqynAPIException(
                "GROUP_SESSION_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
            )
        if session.campaign.business_id != staff.business_id:
            raise JaqynAPIException(
                "WRONG_BUSINESS", status_code=status.HTTP_403_FORBIDDEN
            )

        with transaction.atomic():
            campaign = cls._lock_campaign(session.campaign_id)
            session = (
                Group.objects.select_for_update()
                .select_related("campaign")
                .get(id=session.id)
            )
            if session.status not in {
                Group.Status.FORMING,
                Group.Status.FULL,
            }:
                # Already COMPLETED/EXPIRED/CANCELLED — a re-confirm must not mint
                # a second voucher.
                raise JaqynAPIException(
                    "GROUP_SESSION_INVALID_STATE",
                    status_code=status.HTTP_409_CONFLICT,
                )
            if session.expires_at is not None and session.expires_at <= now:
                session.status = Group.Status.EXPIRED
                session.save(update_fields=["status", "updated_at"])
                raise JaqynAPIException(
                    "GROUP_SESSION_INVALID_STATE",
                    "The group session check-in window has closed",
                    status.HTTP_409_CONFLICT,
                )

            members = list(
                GroupMember.objects.select_for_update().filter(group=session)
            )
            if len(members) < session.required_size:
                raise JaqynAPIException(
                    "GROUP_SESSION_INVALID_STATE",
                    "The required group size has not been reached",
                    status.HTTP_409_CONFLICT,
                )

            reward = getattr(campaign, "reward", None)
            if reward is None:
                raise JaqynAPIException(
                    "VALIDATION_ERROR",
                    "Campaign has no reward configured",
                    status.HTTP_409_CONFLICT,
                )
            # Re-check the reward cap under the held campaign lock before minting the
            # single leader voucher — same backstop as the visit completion path.
            if not CampaignEligibilityService.check_reward_limit(campaign):
                raise JaqynAPIException(
                    "CAMPAIGN_REWARD_LIMIT_REACHED",
                    status_code=status.HTTP_409_CONFLICT,
                )

            for member in members:
                if member.status == GroupMember.Status.JOINED:
                    member.status = GroupMember.Status.CHECKED_IN
                    member.checked_in_at = now
                    member.save(update_fields=["status", "checked_in_at", "updated_at"])

            leader = session.group_leader
            leader_participant = CampaignParticipant.objects.filter(
                campaign=campaign, customer=leader
            ).first()
            voucher = CampaignRewardService.issue_reward_voucher(
                campaign=campaign,
                reward=reward,
                customer=leader,
                participant=leader_participant,
                now=now,
            )
            if leader_participant is not None:
                leader_participant.status = CampaignParticipant.Status.COMPLETED
                leader_participant.completed_at = now
                leader_participant.save(
                    update_fields=["status", "completed_at", "updated_at"]
                )

            session.status = Group.Status.COMPLETED
            session.completed_at = now
            session.save(update_fields=["status", "completed_at", "updated_at"])

            customer_id = str(leader.id)
            voucher_id = str(voucher.id)
            transaction.on_commit(
                lambda: _schedule_reward_notification(customer_id, voucher_id)
            )

        emit_event(
            "campaign_group_completed",
            business_id=str(campaign.business_id),
            campaign_id=str(campaign.id),
            customer_id=str(leader.id),
            group_id=str(session.id),
            voucher_id=str(voucher.id),
        )
        return GroupConfirmResult(
            session=session, voucher=voucher, member_count=len(members)
        )

    @staticmethod
    def groups_for_campaign(campaign: Campaign):
        """Return a GROUP campaign's groups newest-first for the detail tab (queryset).

        Prefetches members so the serializer flattens them without an N+1. Backs
        the business detail "Groups" tab (campaigns-restructure design §5), which
        is ``Group WHERE campaign = ?``.
        """
        return (
            Group.objects.filter(campaign=campaign)
            .select_related("group_leader")
            .prefetch_related("members")
            .order_by("-created_at")
        )

    @staticmethod
    def active_groups_for_customer(customer):
        """Return the customer's non-terminal groups newest-first (queryset).

        A group is "active" for the customer when they lead it, or are a member
        whose own membership is still JOINED/CHECKED_IN, and its status is one of
        FORMING / FULL / CHECKING_IN. Backs the customer feed "active group"
        banner and the per-campaign active-group lookup (the create-vs-forming
        branch). Prefetches campaign + business + members so the serializer has
        no N+1.
        """
        from django.db.models import Q

        active_status = [
            Group.Status.FORMING,
            Group.Status.FULL,
            Group.Status.CHECKING_IN,
        ]
        active_member = [GroupMember.Status.JOINED, GroupMember.Status.CHECKED_IN]
        return (
            Group.objects.filter(status__in=active_status)
            .filter(
                Q(group_leader=customer)
                | Q(members__customer=customer, members__status__in=active_member)
            )
            .select_related("campaign", "campaign__business", "group_leader")
            .prefetch_related("members", "members__customer")
            .distinct()
            .order_by("-created_at")
        )

    @staticmethod
    def expire_old_groups(now: datetime | None = None) -> int:
        """Expire FORMING/FULL groups whose check-in window has closed (plan §1.4).

        Idempotent batch used by the ``expire_old_groups`` Celery task (replaces the
        deleted ``groups.services.expire_old_groups``). Only groups still FORMING or
        FULL with ``expires_at <= now`` are flipped to EXPIRED, so re-running is a
        no-op. Returns the number of groups expired.
        """
        now = now or timezone.now()
        return Group.objects.filter(
            status__in=[Group.Status.FORMING, Group.Status.FULL],
            expires_at__lte=now,
        ).update(status=Group.Status.EXPIRED, updated_at=now)

    @staticmethod
    def get_session_for_customer(group_id, customer) -> Group:
        """Load a group session the customer is a member of, or raise (§11).

        Raises ``GROUP_SESSION_NOT_FOUND`` when the session does not exist or the
        customer is neither its leader nor a member — the two are indistinguishable
        so a customer cannot probe another group's session ids. Prefetches members
        for the group screen.
        """
        session = (
            Group.objects.select_related("campaign")
            .prefetch_related("members")
            .filter(id=group_id)
            .first()
        )
        if session is None or not (
            session.group_leader_id == customer.id
            or GroupMember.objects.filter(group=session, customer=customer).exists()
        ):
            raise JaqynAPIException(
                "GROUP_SESSION_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
            )
        return session

    @classmethod
    def invite_link_for_session(cls, group_id, customer) -> Group:
        """Return the session so the leader can surface its invite token/QR (§11).

        Only the leader may fetch the invite link (``PERMISSION_DENIED`` for a
        non-leader member). Rejects a session that is no longer FORMING/FULL
        (``GROUP_SESSION_INVALID_STATE``) — a completed/expired session has no live
        invite. The view builds the scannable URL from ``invite_token``.
        """
        session = cls.get_session_for_customer(group_id, customer)
        if session.group_leader_id != customer.id:
            raise JaqynAPIException(
                "PERMISSION_DENIED",
                "Only the group leader can share the invite",
                status.HTTP_403_FORBIDDEN,
            )
        if session.status not in {
            Group.Status.FORMING,
            Group.Status.FULL,
        }:
            raise JaqynAPIException(
                "GROUP_SESSION_INVALID_STATE", status_code=status.HTTP_409_CONFLICT
            )
        return session

    @classmethod
    def leave_group_session(
        cls, group_id, customer, now: datetime | None = None
    ) -> Group:
        """Leave (or, as leader, cancel) a group the customer belongs to (group flow).

        Looks up the group by id and asserts the customer is a member or the leader
        (``GROUP_SESSION_NOT_FOUND`` otherwise — indistinguishable from a missing
        group so a customer cannot probe foreign group ids). The group row is locked
        ``select_for_update`` for the whole mutation so a leave cannot race a join.

        Rules:

        * A terminal group (COMPLETED/EXPIRED/CANCELLED) cannot be left
          (``GROUP_SESSION_INVALID_STATE``) — the membership is already settled.
        * **Leader of a still-FORMING group** → the whole group is CANCELLED and
          every still-active (JOINED/CHECKED_IN) member is marked LEFT; the group is
          torn down because it has no leader to complete it.
        * **Leader of a FULL/CHECKING_IN group** → rejected
          (``GROUP_SESSION_INVALID_STATE``): the group has reached size and is
          awaiting staff confirmation, so the leader cannot pull it apart.
        * **Non-leader member** → that member's row is marked LEFT. If the group was
          FULL it drops back to FORMING so the freed slot can be filled again.

        Returns the updated :class:`Group`. Runs in one atomic block.
        """
        now = now or timezone.now()
        with transaction.atomic():
            session = (
                Group.objects.select_for_update()
                .select_related("campaign")
                .filter(id=group_id)
                .first()
            )
            is_leader = session is not None and session.group_leader_id == customer.id
            member = (
                GroupMember.objects.filter(group=session, customer=customer).first()
                if session is not None
                else None
            )
            if session is None or not (is_leader or member is not None):
                raise JaqynAPIException(
                    "GROUP_SESSION_NOT_FOUND",
                    status_code=status.HTTP_404_NOT_FOUND,
                )
            if session.status not in {Group.Status.FORMING, Group.Status.FULL}:
                raise JaqynAPIException(
                    "GROUP_SESSION_INVALID_STATE",
                    "This group can no longer be left",
                    status.HTTP_409_CONFLICT,
                )

            if is_leader:
                if session.status != Group.Status.FORMING:
                    # A FULL group is awaiting staff confirmation; the leader cannot
                    # dissolve it from under the members who already arrived.
                    raise JaqynAPIException(
                        "GROUP_SESSION_INVALID_STATE",
                        "A full group cannot be cancelled by its leader",
                        status.HTTP_409_CONFLICT,
                    )
                GroupMember.objects.filter(
                    group=session,
                    status__in=[
                        GroupMember.Status.JOINED,
                        GroupMember.Status.CHECKED_IN,
                    ],
                ).update(status=GroupMember.Status.LEFT, updated_at=now)
                session.status = Group.Status.CANCELLED
                session.save(update_fields=["status", "updated_at"])
            else:
                # member is not None here (non-leader branch).
                member.status = GroupMember.Status.LEFT  # type: ignore[union-attr]
                member.save(update_fields=["status", "updated_at"])  # type: ignore[union-attr]
                # A member leaving frees a slot, so a FULL group reopens for joins.
                if session.status == Group.Status.FULL:
                    session.status = Group.Status.FORMING
                    session.save(update_fields=["status", "updated_at"])

        emit_event(
            "campaign_group_left",
            business_id=str(session.campaign.business_id),
            campaign_id=str(session.campaign_id),
            customer_id=str(customer.id),
            group_id=str(session.id),
            as_leader=is_leader,
        )
        return session

    @classmethod
    def demo_fill_group(cls, group_id, requester, now: datetime | None = None) -> Group:
        """DEV-only: auto-join real customer users until the group is FULL (demo aid).

        A demo/testing convenience to simulate friends joining without driving a
        second device per friend. Resolves the group the ``requester`` belongs to
        (``get_session_for_customer`` — ``GROUP_SESSION_NOT_FOUND`` if they are not
        a member/leader). Picks other ``CUSTOMER``-role users who are not already
        members and not the leader, then joins each one through the **real**
        :meth:`join_group_session` path so the state machine (member count, the
        flip to FULL when ``required_size`` is reached, the check-in token already
        minted at start) is byte-for-byte identical to genuine joins.

        Raises ``GROUP_SESSION_INVALID_STATE`` if the group is not FORMING, or
        ``VALIDATION_ERROR`` if there are not enough other customer users to fill it.
        This method performs no gating itself — the **view** must restrict it to
        non-production (``settings.DEBUG``); see ``GroupSessionDemoFillView``.
        Returns the (now usually FULL) group.
        """
        from apps.accounts.models import User

        now = now or timezone.now()
        session = cls.get_session_for_customer(group_id, requester)
        if session.status != Group.Status.FORMING:
            raise JaqynAPIException(
                "GROUP_SESSION_INVALID_STATE",
                "Only a forming group can be demo-filled",
                status.HTTP_409_CONFLICT,
            )

        member_ids = set(
            GroupMember.objects.filter(group=session).values_list(
                "customer_id", flat=True
            )
        )
        member_ids.add(session.group_leader_id)
        needed = (
            session.required_size - GroupMember.objects.filter(group=session).count()
        )
        if needed <= 0:
            return session

        fillers = list(
            User.objects.filter(role=User.Role.CUSTOMER)
            .exclude(id__in=member_ids)
            .order_by("id")[:needed]
        )
        # DEV-only: if the seed doesn't have enough real customers, fabricate
        # throwaway demo users so "simulate friends joining" always fills the
        # group. Synthetic phone (uuid-based) keeps them unique; the view gates
        # this whole path on settings.DEBUG so these never appear in prod.
        if len(fillers) < needed:
            import uuid

            for _ in range(needed - len(fillers)):
                fillers.append(
                    User.objects.create(
                        phone=f"+99{uuid.uuid4().hex[:12]}",
                        role=User.Role.CUSTOMER,
                        name="Demo friend",
                    )
                )

        for filler in fillers:
            # Reuse the real join path so full→checkin transitions exactly as a
            # genuine join would; never replicate the state machine here.
            cls.join_group_session(session.invite_token, filler, now=now)

        session.refresh_from_db()
        return session
