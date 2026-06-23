"""Group-campaign session runtime (plan §11 / D7 / Q4 / Q6 — group is in MVP).

Owns the real GROUP loop: a leader starts a session (minting a GROUP_INVITE QR
token), members join via that token, and a staff member confirms the coordinated
check-in. On a valid confirmation the session is marked COMPLETED and **exactly
one** reward voucher is issued to the *leader* (plan Q4 — leader gets the single
voucher), reusing :class:`CampaignRewardService` and the same reward-cap re-check
the visit path uses.

Contention is handled the same way as the visit path: the ``Campaign`` row is
locked first, then the ``GroupSession`` row, in that fixed order, so the
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
    GroupSession,
    GroupSessionMember,
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

    session: GroupSession
    voucher: CampaignRewardVoucher
    member_count: int


class CampaignGroupService:
    """Run group-campaign sessions end to end (plan §11 / Q4 / Q6).

    The contention-sensitive entry point is :meth:`confirm_group_visit`, which
    mints the single leader voucher under a ``Campaign`` → ``GroupSession`` lock
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
    ) -> GroupSession:
        """Start a group session for a leader, minting the GROUP_INVITE token (§11).

        Rejects a non-GROUP campaign (``VALIDATION_ERROR``) or a campaign that is
        not ACTIVE (``CAMPAIGN_NOT_ACTIVE``). Creates a FORMING :class:`GroupSession`
        whose ``required_size`` is the rule's group size and whose ``expires_at`` is
        ``now`` plus the check-in window, mints a ``GROUP_INVITE`` QR token whose
        value is the session's ``invite_token`` (members join by scanning it), and
        enrols the leader as the first ``GroupSessionMember`` (CHECKED_IN — the
        leader is present by definition). The leader is also auto-joined as a
        :class:`CampaignParticipant` so the reward can attach to their row on
        completion. Runs in one atomic block.
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
            session = GroupSession.objects.create(
                campaign=campaign,
                group_leader=leader,
                status=GroupSession.Status.FORMING,
                required_size=required_size,
                invite_token=token.token,
                expires_at=now + timedelta(minutes=window),
            )
            # The leader is a participant so the reward attaches to a real row on
            # completion; they are present, so they are CHECKED_IN from the start.
            CampaignProgressService.join_campaign(campaign, leader)
            GroupSessionMember.objects.create(
                group_session=session,
                customer=leader,
                status=GroupSessionMember.Status.CHECKED_IN,
                joined_at=now,
                checked_in_at=now,
            )

        emit_event(
            "campaign_group_session_started",
            business_id=str(campaign.business_id),
            campaign_id=str(campaign.id),
            customer_id=str(leader.id),
            group_session_id=str(session.id),
        )
        return session

    @classmethod
    def join_group_session(
        cls,
        invite_token: str,
        customer,
        now: datetime | None = None,
    ) -> GroupSessionMember:
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
                GroupSession.objects.select_for_update()
                .select_related("campaign")
                .filter(invite_token=invite_token)
                .first()
            )
            if session is None:
                raise JaqynAPIException(
                    "GROUP_SESSION_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
                )
            existing = GroupSessionMember.objects.filter(
                group_session=session, customer=customer
            ).first()
            if existing is not None:
                return existing
            if session.status != GroupSession.Status.FORMING:
                raise JaqynAPIException(
                    "GROUP_SESSION_INVALID_STATE",
                    status_code=status.HTTP_409_CONFLICT,
                )
            member_count = GroupSessionMember.objects.filter(
                group_session=session
            ).count()
            if member_count >= session.required_size:
                raise JaqynAPIException(
                    "GROUP_SESSION_FULL", status_code=status.HTTP_409_CONFLICT
                )
            member = GroupSessionMember.objects.create(
                group_session=session,
                customer=customer,
                status=GroupSessionMember.Status.JOINED,
                joined_at=now,
            )
            # Reaching the required size flips the session to FULL so late joiners
            # are rejected; it is not yet COMPLETED — staff confirmation does that.
            if member_count + 1 >= session.required_size:
                session.status = GroupSession.Status.FULL
                session.save(update_fields=["status", "updated_at"])

        emit_event(
            "campaign_group_session_joined",
            business_id=str(session.campaign.business_id),
            campaign_id=str(session.campaign_id),
            customer_id=str(customer.id),
            group_session_id=str(session.id),
        )
        return member

    @classmethod
    def confirm_group_visit(
        cls,
        staff: StaffMember,
        group_session_id,
        now: datetime | None = None,
    ) -> GroupConfirmResult:
        """Confirm a group check-in and issue the single leader voucher (§11 / Q4).

        The coordinated MVP confirmation: the staff member confirms the whole table
        at once. Loads the session and asserts it belongs to the staff member's
        business (``WRONG_BUSINESS``). Locks the ``Campaign`` row first, then the
        ``GroupSession`` row (the fixed Campaign → session order that prevents a
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
            GroupSession.objects.select_related("campaign", "campaign__reward")
            .filter(id=group_session_id)
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
                GroupSession.objects.select_for_update()
                .select_related("campaign")
                .get(id=session.id)
            )
            if session.status not in {
                GroupSession.Status.FORMING,
                GroupSession.Status.FULL,
            }:
                # Already COMPLETED/EXPIRED/CANCELLED — a re-confirm must not mint
                # a second voucher.
                raise JaqynAPIException(
                    "GROUP_SESSION_INVALID_STATE",
                    status_code=status.HTTP_409_CONFLICT,
                )
            if session.expires_at is not None and session.expires_at <= now:
                session.status = GroupSession.Status.EXPIRED
                session.save(update_fields=["status", "updated_at"])
                raise JaqynAPIException(
                    "GROUP_SESSION_INVALID_STATE",
                    "The group session check-in window has closed",
                    status.HTTP_409_CONFLICT,
                )

            members = list(
                GroupSessionMember.objects.select_for_update().filter(
                    group_session=session
                )
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
                if member.status == GroupSessionMember.Status.JOINED:
                    member.status = GroupSessionMember.Status.CHECKED_IN
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

            session.status = GroupSession.Status.COMPLETED
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
            group_session_id=str(session.id),
            voucher_id=str(voucher.id),
        )
        return GroupConfirmResult(
            session=session, voucher=voucher, member_count=len(members)
        )

    @staticmethod
    def get_session_for_customer(group_session_id, customer) -> GroupSession:
        """Load a group session the customer is a member of, or raise (§11).

        Raises ``GROUP_SESSION_NOT_FOUND`` when the session does not exist or the
        customer is neither its leader nor a member — the two are indistinguishable
        so a customer cannot probe another group's session ids. Prefetches members
        for the group screen.
        """
        session = (
            GroupSession.objects.select_related("campaign")
            .prefetch_related("members")
            .filter(id=group_session_id)
            .first()
        )
        if session is None or not (
            session.group_leader_id == customer.id
            or GroupSessionMember.objects.filter(
                group_session=session, customer=customer
            ).exists()
        ):
            raise JaqynAPIException(
                "GROUP_SESSION_NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND
            )
        return session

    @classmethod
    def invite_link_for_session(cls, group_session_id, customer) -> GroupSession:
        """Return the session so the leader can surface its invite token/QR (§11).

        Only the leader may fetch the invite link (``PERMISSION_DENIED`` for a
        non-leader member). Rejects a session that is no longer FORMING/FULL
        (``GROUP_SESSION_INVALID_STATE``) — a completed/expired session has no live
        invite. The view builds the scannable URL from ``invite_token``.
        """
        session = cls.get_session_for_customer(group_session_id, customer)
        if session.group_leader_id != customer.id:
            raise JaqynAPIException(
                "PERMISSION_DENIED",
                "Only the group leader can share the invite",
                status.HTTP_403_FORBIDDEN,
            )
        if session.status not in {
            GroupSession.Status.FORMING,
            GroupSession.Status.FULL,
        }:
            raise JaqynAPIException(
                "GROUP_SESSION_INVALID_STATE", status_code=status.HTTP_409_CONFLICT
            )
        return session
