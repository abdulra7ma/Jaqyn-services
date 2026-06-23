import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from rest_framework import status

from apps.businesses.models import Business
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption, RewardTransaction
from apps.loyalty.tasks import send_reward_unlocked
from apps.qr.models import QRCodeToken, ScanLog
from apps.qr.services import create_token, resolve_qr_token, validate_approval_code
from apps.staff.models import StaffMember
from core.exceptions import JaqynAPIException
from core.logging import emit_event, log_scan


def ensure_business_active(business):
    if business.status != Business.Status.APPROVED:
        raise JaqynAPIException("BUSINESS_NOT_ACTIVE", status_code=status.HTTP_400_BAD_REQUEST)


def create_reward_program(business, data):
    ensure_business_active(business)
    program = RewardProgram.objects.create(business=business, **data)
    emit_event("reward_program_created", business_id=str(business.id), reward_program_id=str(program.id))
    return program


def active_program_for_business(business, program_id=None):
    queryset = RewardProgram.objects.filter(business=business, is_active=True)
    if program_id:
        queryset = queryset.filter(id=program_id)
    program = queryset.order_by("-created_at").first()
    if program is None:
        raise JaqynAPIException("BUSINESS_NOT_ACTIVE", "No active reward program", status.HTTP_400_BAD_REQUEST)
    return program


def redemption_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def create_redemption(progress):
    code = redemption_code()
    while RewardRedemption.objects.filter(code=code).exists():
        code = redemption_code()
    expires_at = None
    if progress.reward_program.expiry_days:
        expires_at = timezone.now() + timedelta(days=progress.reward_program.expiry_days)
    redemption = RewardRedemption.objects.create(
        customer=progress.customer,
        business=progress.business,
        reward_program=progress.reward_program,
        progress=progress,
        code=code,
        expires_at=expires_at,
    )
    create_token(QRCodeToken.Type.REWARD_REDEEM, business=progress.business, customer=progress.customer, reward_progress=progress, reward_redemption=redemption, expires_at=expires_at)
    return redemption


def ensure_pending_redemption(progress):
    if progress.status != CustomerRewardProgress.Status.UNLOCKED:
        raise JaqynAPIException("VALIDATION_ERROR", "Reward is not unlocked", status.HTTP_409_CONFLICT)

    existing = progress.redemptions.filter(status=RewardRedemption.Status.PENDING).order_by("-created_at").first()
    if existing and (existing.expires_at is None or existing.expires_at > timezone.now()):
        return existing
    return create_redemption(progress)


def expire_pending_rewards():
    now = timezone.now()
    redemptions = RewardRedemption.objects.filter(status=RewardRedemption.Status.PENDING, expires_at__lte=now)
    progress_ids = list(redemptions.values_list("progress_id", flat=True))
    count = redemptions.update(status=RewardRedemption.Status.EXPIRED)
    CustomerRewardProgress.objects.filter(id__in=progress_ids, status=CustomerRewardProgress.Status.UNLOCKED).update(status=CustomerRewardProgress.Status.EXPIRED, updated_at=now)
    return count


def get_staff_for_user(user):
    try:
        return user.staff_memberships.select_related("business").get(is_active=True)
    except StaffMember.DoesNotExist:
        raise JaqynAPIException("PERMISSION_DENIED", status_code=status.HTTP_403_FORBIDDEN)


def redemption_from_code_or_token(code=None, token=None, request=None):
    if token:
        qr_token = resolve_qr_token(token, request, action="redeem")
        if qr_token.type != QRCodeToken.Type.REWARD_REDEEM or qr_token.reward_redemption is None:
            raise JaqynAPIException("INVALID_QR_TOKEN", status_code=status.HTTP_400_BAD_REQUEST)
        return qr_token.reward_redemption, qr_token
    try:
        return RewardRedemption.objects.select_related("business", "progress", "reward_program", "customer").get(code=code), None
    except RewardRedemption.DoesNotExist:
        raise JaqynAPIException("INVALID_QR_TOKEN", "Redemption code is invalid", status.HTTP_404_NOT_FOUND)


def _mint_and_reset_count(progress, program, customer, business, staff, raw_token):
    """Mint a redemption voucher and reset count progress. Called inside atomic block."""
    redemption = create_redemption(progress)
    progress.current_count = 0
    progress.completed_count = (progress.completed_count or 0) + 1
    progress.save(update_fields=["current_count", "completed_count", "updated_at"])
    RewardTransaction.objects.create(
        customer=customer,
        business=business,
        reward_program=program,
        progress=progress,
        action=RewardTransaction.Action.UNLOCKED,
        amount_count=0,
        source=RewardTransaction.Source.STAFF_MANUAL,
        staff=staff,
        metadata={"raw_token": raw_token} if raw_token else {},
    )
    send_reward_unlocked.delay(str(customer.id), str(redemption.id))
    emit_event("reward_unlocked", business_id=str(business.id), customer_id=str(customer.id), reward_program_id=str(program.id))
    return redemption


def _mint_and_reset_spend(progress, program, customer, business, staff, raw_token):
    """Mint a redemption voucher and subtract required_spend. Called inside atomic block."""
    redemption = create_redemption(progress)
    progress.current_spend = (progress.current_spend or 0) - program.required_spend
    progress.completed_count = (progress.completed_count or 0) + 1
    progress.save(update_fields=["current_spend", "completed_count", "updated_at"])
    RewardTransaction.objects.create(
        customer=customer,
        business=business,
        reward_program=program,
        progress=progress,
        action=RewardTransaction.Action.UNLOCKED,
        amount_count=0,
        source=RewardTransaction.Source.STAFF_MANUAL,
        staff=staff,
        metadata={"raw_token": raw_token} if raw_token else {},
    )
    send_reward_unlocked.delay(str(customer.id), str(redemption.id))
    emit_event("reward_unlocked", business_id=str(business.id), customer_id=str(customer.id), reward_program_id=str(program.id))
    return redemption


def _pending_banked_count(customer, business, program):
    """Count PENDING non-expired redemptions for (customer, business, program)."""
    now = timezone.now()
    return RewardRedemption.objects.filter(
        customer=customer,
        business=business,
        reward_program=program,
        status=RewardRedemption.Status.PENDING,
    ).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    ).count()


def redeem_reward(staff, code=None, token=None, request=None):
    redemption, qr_token = redemption_from_code_or_token(code=code, token=token, request=request)
    error = None
    with transaction.atomic():
        # NOTE: select_related("progress") is omitted from select_for_update because
        # progress is nullable (outer join) and PostgreSQL rejects FOR UPDATE on nullable
        # outer-join columns. We fetch progress separately when needed.
        redemption = RewardRedemption.objects.select_for_update().select_related("business", "reward_program", "customer").get(id=redemption.id)

        if redemption.business_id != staff.business_id:
            error = ("WRONG_BUSINESS", "Reward belongs to another business", status.HTTP_403_FORBIDDEN)
        elif redemption.status != RewardRedemption.Status.PENDING:
            error = ("REWARD_ALREADY_REDEEMED", None, status.HTTP_409_CONFLICT)
        elif redemption.expires_at and redemption.expires_at <= timezone.now():
            redemption.status = RewardRedemption.Status.EXPIRED
            redemption.save(update_fields=["status"])
            if redemption.progress_id:
                CustomerRewardProgress.objects.filter(
                    id=redemption.progress_id,
                    status=CustomerRewardProgress.Status.UNLOCKED,
                ).update(status=CustomerRewardProgress.Status.EXPIRED)
            error = ("REWARD_EXPIRED", None, status.HTTP_400_BAD_REQUEST)
        else:
            now = timezone.now()
            redemption.status = RewardRedemption.Status.REDEEMED
            redemption.redeemed_by = staff
            redemption.redeemed_at = now
            redemption.presented_at = None
            redemption.save(update_fields=["status", "redeemed_by", "redeemed_at", "presented_at"])
            # NOTE: progress stays ACTIVE — do not set REDEEMED on progress
            if redemption.progress_id:
                RewardTransaction.objects.create(
                    customer=redemption.customer,
                    business=redemption.business,
                    reward_program=redemption.reward_program,
                    progress_id=redemption.progress_id,
                    action=RewardTransaction.Action.ADJUSTED,
                    amount_count=0,
                    source=RewardTransaction.Source.STAFF_MANUAL,
                    staff=staff,
                    metadata={"redemption": str(redemption.id), "redeemed": True},
                )
            # Eager resume: if the customer has a held-full (bank_full) card for this
            # program and is now under cap, mint from it so the earned reward isn't lost.
            program = redemption.reward_program
            if program.max_banked is not None and redemption.progress_id:
                banked_after = _pending_banked_count(
                    redemption.customer, redemption.business, program
                )
                if banked_after < program.max_banked:
                    # Lock progress for update
                    try:
                        held_progress = CustomerRewardProgress.objects.select_for_update().get(
                            id=redemption.progress_id,
                            status=CustomerRewardProgress.Status.ACTIVE,
                        )
                        target = held_progress.target_count or 1
                        required = program.required_spend
                        if program.type == RewardProgram.Type.SPEND:
                            if required and held_progress.current_spend >= required:
                                _mint_and_reset_spend(held_progress, program, redemption.customer, redemption.business, staff, raw_token=None)
                        else:
                            if held_progress.current_count >= target:
                                _mint_and_reset_count(held_progress, program, redemption.customer, redemption.business, staff, raw_token=None)
                    except CustomerRewardProgress.DoesNotExist:
                        pass

    if error:
        code_value, message, http_status = error
        log_scan(qr_token=qr_token, token_value=token or code, staff=staff, business=staff.business, action="redeem_reward", status=ScanLog.Status.BLOCKED, failure_reason=code_value)
        raise JaqynAPIException(code_value, message, http_status)

    log_scan(qr_token=qr_token, token_value=token or code, staff=staff, business=staff.business, customer=redemption.customer, action="redeem_reward", status=ScanLog.Status.SUCCESS)
    emit_event("reward_redeemed", business_id=str(redemption.business_id), customer_id=str(redemption.customer_id), redemption_id=str(redemption.id))
    emit_event("staff_redeemed_reward", business_id=str(redemption.business_id), staff_id=str(staff.id), redemption_id=str(redemption.id))
    return redemption


def check_collect_limits(customer, business):
    now = timezone.now()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    earned_today = RewardTransaction.objects.filter(
        customer=customer,
        business=business,
        action=RewardTransaction.Action.EARNED,
        source=RewardTransaction.Source.QR_SCAN,
        created_at__gte=start,
    ).count()
    if earned_today >= settings.COLLECT_DAILY_LIMIT:
        raise JaqynAPIException("SCAN_LIMIT_REACHED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)

    latest = RewardTransaction.objects.filter(
        customer=customer,
        business=business,
        action=RewardTransaction.Action.EARNED,
        source=RewardTransaction.Source.QR_SCAN,
    ).order_by("-created_at").first()
    if latest and (now - latest.created_at).total_seconds() < settings.COLLECT_MIN_INTERVAL_SECONDS:
        raise JaqynAPIException("SCAN_LIMIT_REACHED", status_code=status.HTTP_429_TOO_MANY_REQUESTS)


def staff_collect(staff, raw_token, amount=None, program_id=None, request=None):
    """
    Staff scans a customer's personal QR to award loyalty points.
    Returns a plain dict with state + customer/program/progress/reward/redemption.
    States: awarded | needs_amount | reward_ready

    When ``amount`` is supplied it is recorded as ``amount_spend`` on the EARNED
    transaction for *both* spend and count programs. Spend programs require it to
    advance; count programs treat it as optional spend telemetry (feeds the
    Reports spend KPIs — avg spend / visit, customer value). It never affects how
    a count program advances.
    """
    qr_token = resolve_qr_token(raw_token, request, action="staff_collect")

    if qr_token.type != QRCodeToken.Type.CUSTOMER_PROFILE or qr_token.customer is None:
        raise JaqynAPIException("INVALID_QR_TOKEN", status_code=status.HTTP_400_BAD_REQUEST)

    customer = qr_token.customer
    business = staff.business
    ensure_business_active(business)

    if customer.id == business.owner_id:
        raise JaqynAPIException("WRONG_BUSINESS", "Cannot scan your own business QR", status_code=status.HTTP_403_FORBIDDEN)

    program = active_program_for_business(business, program_id)

    def _build_result(state, progress, redemption=None, rewards_earned=0, bank_full=False):
        result = {
            "state": state,
            "customer": {"name": customer.name or ""},
            "program": {
                "id": str(program.id),
                "type": program.type,
                "title": program.title,
                "required_count": program.required_count,
                "required_spend": str(program.required_spend) if program.required_spend is not None else None,
            },
            "progress": {
                "current_count": progress.current_count,
                "target_count": progress.target_count,
                "current_spend": str(progress.current_spend),
                "required_spend": str(program.required_spend) if program.required_spend is not None else None,
                "status": progress.status,
                "completed_count": progress.completed_count,
            } if progress is not None else None,
            "reward": {
                "title": program.title,
                "reward_description": program.reward_description,
            } if state == "reward_ready" else None,
            "redemption": {
                "id": str(redemption.id),
                "code": redemption.code,
            } if redemption is not None else None,
        }
        if state == "awarded":
            result["rewards_earned"] = rewards_earned
            result["bank_full"] = bank_full
        return result

    # --- Redeem branch (NEW): check for a presented voucher ---
    now = timezone.now()
    ttl = getattr(settings, "REWARD_PRESENT_TTL_SECONDS", 120)
    ttl_cutoff = now - timedelta(seconds=ttl)
    presented_redemption = RewardRedemption.objects.filter(
        customer=customer,
        business=business,
        status=RewardRedemption.Status.PENDING,
        presented_at__isnull=False,
        presented_at__gte=ttl_cutoff,
    ).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    ).order_by("-presented_at").first()
    if presented_redemption is not None:
        presented_progress = presented_redemption.progress
        return _build_result("reward_ready", presented_progress, presented_redemption)

    # --- needs_amount: spend program with no amount ---
    if program.type == RewardProgram.Type.SPEND and amount is None:
        progress_for_response = CustomerRewardProgress.objects.filter(
            customer=customer, business=business, reward_program=program,
        ).first()
        return _build_result("needs_amount", progress_for_response)

    # --- Award branch (mint + reset, never stuck) ---
    with transaction.atomic():
        progress, _ = CustomerRewardProgress.objects.select_for_update().get_or_create(
            customer=customer,
            business=business,
            reward_program=program,
            defaults={
                "target_count": program.required_count or 1,
                "status": CustomerRewardProgress.Status.ACTIVE,
            },
        )
        # Ensure progress stays ACTIVE regardless of legacy status
        if progress.status != CustomerRewardProgress.Status.ACTIVE:
            progress.status = CustomerRewardProgress.Status.ACTIVE
            progress.save(update_fields=["status", "updated_at"])

        rewards_earned = 0
        bank_full = False

        if program.type == RewardProgram.Type.SPEND:
            progress.current_spend = (progress.current_spend or 0) + amount
            progress.save(update_fields=["current_spend", "updated_at"])
            RewardTransaction.objects.create(
                customer=customer,
                business=business,
                reward_program=program,
                progress=progress,
                action=RewardTransaction.Action.EARNED,
                amount_spend=amount,
                source=RewardTransaction.Source.STAFF_MANUAL,
                staff=staff,
                metadata={"raw_token": raw_token},
            )
            # Spend loop: mint while spend >= required_spend
            while program.required_spend is not None and progress.current_spend >= program.required_spend:
                # Cap check before minting
                if program.max_banked is not None:
                    banked = _pending_banked_count(customer, business, program)
                    if banked >= program.max_banked:
                        # Hold at threshold (clamp current_spend to required_spend)
                        progress.current_spend = program.required_spend
                        progress.save(update_fields=["current_spend", "updated_at"])
                        bank_full = True
                        break
                _mint_and_reset_spend(progress, program, customer, business, staff, raw_token)
                rewards_earned += 1
        else:
            progress.current_count += 1
            progress.save(update_fields=["current_count", "updated_at"])
            RewardTransaction.objects.create(
                customer=customer,
                business=business,
                reward_program=program,
                progress=progress,
                action=RewardTransaction.Action.EARNED,
                amount_count=1,
                amount_spend=amount,  # optional spend telemetry for count programs
                source=RewardTransaction.Source.STAFF_MANUAL,
                staff=staff,
                metadata={"raw_token": raw_token},
            )
            target = progress.target_count or 1
            if progress.current_count >= target:
                # Cap check before minting
                at_cap = False
                if program.max_banked is not None:
                    banked = _pending_banked_count(customer, business, program)
                    if banked >= program.max_banked:
                        # Hold at target (clamp count to target), do NOT reset
                        progress.current_count = target
                        progress.save(update_fields=["current_count", "updated_at"])
                        bank_full = True
                        at_cap = True
                if not at_cap:
                    _mint_and_reset_count(progress, program, customer, business, staff, raw_token)
                    rewards_earned += 1

        emit_event("reward_collected", business_id=str(business.id), customer_id=str(customer.id), reward_program_id=str(program.id))

    return _build_result("awarded", progress, rewards_earned=rewards_earned, bank_full=bank_full)


def present_redemption(customer, redemption_id):
    """
    Customer taps 'Use' on a voucher: set presented_at=now and clear it on all others.
    Returns the updated redemption.
    """
    # Quick non-locking pre-check to give a fast 404/error before locking
    if not RewardRedemption.objects.filter(id=redemption_id, customer=customer).exists():
        raise JaqynAPIException("INVALID_QR_TOKEN", "Redemption not found", status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        try:
            redemption = RewardRedemption.objects.select_for_update().select_related("reward_program", "business").get(
                id=redemption_id, customer=customer
            )
        except RewardRedemption.DoesNotExist:
            raise JaqynAPIException("INVALID_QR_TOKEN", "Redemption not found", status.HTTP_404_NOT_FOUND)

        if redemption.status != RewardRedemption.Status.PENDING:
            raise JaqynAPIException("REWARD_ALREADY_REDEEMED", status_code=status.HTTP_409_CONFLICT)

        now = timezone.now()
        if redemption.expires_at and redemption.expires_at <= now:
            raise JaqynAPIException("REWARD_EXPIRED", status_code=status.HTTP_400_BAD_REQUEST)

        # Clear presented_at on all other pending redemptions for this customer
        RewardRedemption.objects.filter(
            customer=customer,
            status=RewardRedemption.Status.PENDING,
            presented_at__isnull=False,
        ).exclude(id=redemption_id).update(presented_at=None)

        redemption.presented_at = now
        redemption.save(update_fields=["presented_at"])

    return redemption


def customer_wallet(customer):
    """
    Returns {available: [...grouped PENDING redemptions...], in_progress: [...ACTIVE progress...]}
    """
    now = timezone.now()

    # PENDING, non-expired redemptions
    pending = RewardRedemption.objects.filter(
        customer=customer,
        status=RewardRedemption.Status.PENDING,
    ).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    ).select_related("business", "reward_program").order_by("expires_at")

    # Group by (business_id, reward_program_id)
    grouped = {}
    for r in pending:
        key = (r.business_id, r.reward_program_id)
        if key not in grouped:
            grouped[key] = {
                "business": {"id": str(r.business_id), "name": r.business.name},
                "reward": {
                    "id": str(r.reward_program_id),
                    "title": r.reward_program.title,
                    "description": r.reward_program.reward_description,
                },
                "count": 0,
                "soonest_expiry": None,
                "redemption_ids": [],
            }
        entry = grouped[key]
        entry["count"] += 1
        entry["redemption_ids"].append(str(r.id))
        if r.expires_at is not None:
            if entry["soonest_expiry"] is None or r.expires_at < entry["soonest_expiry"]:
                entry["soonest_expiry"] = r.expires_at

    available = list(grouped.values())

    # ACTIVE progress records
    active_progress = CustomerRewardProgress.objects.filter(
        customer=customer,
        status=CustomerRewardProgress.Status.ACTIVE,
    ).select_related("business", "reward_program").order_by("-updated_at")

    in_progress = []
    for p in active_progress:
        in_progress.append({
            "id": str(p.id),
            "business": {"id": str(p.business_id), "name": p.business.name},
            "reward_program": {
                "id": str(p.reward_program_id),
                "type": p.reward_program.type,
                "title": p.reward_program.title,
                "description": p.reward_program.description,
                "reward_description": p.reward_program.reward_description,
            },
            "type": p.reward_program.type,
            "current_count": p.current_count,
            "target_count": p.target_count,
            "current_spend": str(p.current_spend),
            "required_spend": str(p.reward_program.required_spend) if p.reward_program.required_spend is not None else None,
            "completed_count": p.completed_count,
        })

    return {"available": available, "in_progress": in_progress}


def business_reward_card(customer, business_id):
    """
    Returns the per-business reward card view: programs+progress, available vouchers, history.
    """
    try:
        business = Business.objects.get(id=business_id)
    except Business.DoesNotExist:
        raise JaqynAPIException("INVALID_QR_TOKEN", "Business not found", status.HTTP_404_NOT_FOUND)

    now = timezone.now()

    # All active programs for this business
    programs = RewardProgram.objects.filter(business=business, is_active=True).order_by("-created_at")

    programs_data = []
    for prog in programs:
        try:
            progress = CustomerRewardProgress.objects.get(
                customer=customer, business=business, reward_program=prog
            )
            current_count = progress.current_count
            current_spend = str(progress.current_spend)
            completed_count = progress.completed_count
        except CustomerRewardProgress.DoesNotExist:
            progress = None
            current_count = 0
            current_spend = "0"
            completed_count = 0

        # Count available (PENDING non-expired) vouchers for this program
        available_count = RewardRedemption.objects.filter(
            customer=customer,
            business=business,
            reward_program=prog,
            status=RewardRedemption.Status.PENDING,
        ).filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
        ).count()

        # bank_full: at cap?
        bank_full = False
        if prog.max_banked is not None and available_count >= prog.max_banked:
            bank_full = True

        programs_data.append({
            "id": str(prog.id),
            "type": prog.type,
            "title": prog.title,
            "reward_description": prog.reward_description,
            "current_count": current_count,
            "target_count": prog.required_count,
            "current_spend": current_spend,
            "required_spend": str(prog.required_spend) if prog.required_spend is not None else None,
            "completed_count": completed_count,
            "available_count": available_count,
            "bank_full": bank_full,
        })

    # Available (PENDING non-expired) redemptions for any program at this business
    available_redemptions = RewardRedemption.objects.filter(
        customer=customer,
        business=business,
        status=RewardRedemption.Status.PENDING,
    ).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    ).select_related("reward_program").order_by("expires_at")

    available = []
    for r in available_redemptions:
        available.append({
            "id": str(r.id),
            "reward_title": r.reward_program.title,
            "reward_description": r.reward_program.reward_description,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "created_at": r.created_at.isoformat(),
        })

    # History: REDEEMED + EXPIRED, newest first
    history_redemptions = RewardRedemption.objects.filter(
        customer=customer,
        business=business,
        status__in=[RewardRedemption.Status.REDEEMED, RewardRedemption.Status.EXPIRED],
    ).select_related("reward_program").order_by("-created_at")

    history = []
    for r in history_redemptions:
        history.append({
            "id": str(r.id),
            "reward_title": r.reward_program.title,
            "status": r.status,
            "redeemed_at": r.redeemed_at.isoformat() if r.redeemed_at else None,
            "created_at": r.created_at.isoformat(),
        })

    return {
        "business": {
            "id": str(business.id),
            "name": business.name,
            "area": business.area,
        },
        "programs": programs_data,
        "available": available,
        "history": history,
    }


def collect_from_qr(raw_token, customer, approval_code, request=None, program_id=None):
    qr_token = None
    try:
        qr_token = resolve_qr_token(raw_token, request, action="collect")
        if qr_token.type != QRCodeToken.Type.MERCHANT_COLLECT or qr_token.business is None:
            raise JaqynAPIException("INVALID_QR_TOKEN", status_code=status.HTTP_400_BAD_REQUEST)
        business = qr_token.business
        ensure_business_active(business)
        program = active_program_for_business(business, program_id)
        validate_approval_code(business, approval_code, customer, request)
        check_collect_limits(customer, business)

        with transaction.atomic():
            progress, _ = CustomerRewardProgress.objects.select_for_update().get_or_create(
                customer=customer,
                business=business,
                reward_program=program,
                defaults={"target_count": program.required_count or 1},
            )
            if progress.status != CustomerRewardProgress.Status.ACTIVE:
                raise JaqynAPIException("SCAN_LIMIT_REACHED", "Reward progress is not active", status.HTTP_409_CONFLICT)

            progress.current_count += 1
            progress.save(update_fields=["current_count", "updated_at"])
            RewardTransaction.objects.create(
                customer=customer,
                business=business,
                reward_program=program,
                progress=progress,
                action=RewardTransaction.Action.EARNED,
                source=RewardTransaction.Source.QR_SCAN,
                metadata={"qr_token": raw_token},
            )
            emit_event("merchant_qr_scanned", business_id=str(business.id), customer_id=str(customer.id))
            emit_event("reward_collected", business_id=str(business.id), customer_id=str(customer.id), reward_program_id=str(program.id))

            redemption = None
            target = progress.target_count or 1
            if progress.current_count >= target:
                progress.status = CustomerRewardProgress.Status.UNLOCKED
                progress.unlocked_at = timezone.now()
                if program.expiry_days:
                    progress.expires_at = progress.unlocked_at + timedelta(days=program.expiry_days)
                progress.save(update_fields=["status", "unlocked_at", "expires_at", "updated_at"])
                RewardTransaction.objects.create(
                    customer=customer,
                    business=business,
                    reward_program=program,
                    progress=progress,
                    action=RewardTransaction.Action.UNLOCKED,
                    amount_count=0,
                    source=RewardTransaction.Source.QR_SCAN,
                    metadata={"qr_token": raw_token},
                )
                redemption = create_redemption(progress)
                send_reward_unlocked.delay(str(customer.id), str(redemption.id))
                emit_event("reward_unlocked", business_id=str(business.id), customer_id=str(customer.id), reward_program_id=str(program.id))

        log_scan(qr_token=qr_token, token_value=raw_token, customer=customer, business=business, action="collect_reward", status=ScanLog.Status.SUCCESS)
        return progress
    except JaqynAPIException as exc:
        business = getattr(qr_token, "business", None)
        log_scan(qr_token=qr_token, token_value=raw_token, customer=customer, business=business, action="collect_reward", status=ScanLog.Status.BLOCKED, failure_reason=exc.code)
        raise
