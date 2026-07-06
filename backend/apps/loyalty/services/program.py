from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import QuerySet

from apps.businesses.models import Business
from apps.loyalty.models import LoyaltyProgram, LoyaltyTier
from core.exceptions import JaqynAPIException

# Ladder size cap: enough for Bronze→Platinum-style ladders while keeping the
# customer-facing ladder scannable on one card. Product decision, not technical.
MAX_TIERS = 6


class LoyaltyProgramService:
    """Create and manage ongoing programs while enforcing publishable configs."""

    @staticmethod
    def _validate_tiers(tiers: list[dict[str, Any]]) -> None:
        """Validate one status ladder: rung count, order, labels, and rates.

        Rules enforced: at most ``MAX_TIERS`` rungs; the first rung starts at
        0 visits (every member holds a status from day one); ``min_visits``
        strictly ascending; every rung has a non-empty, unique name; every
        ``cashback_percent`` is in (0, 100].
        """
        if len(tiers) > MAX_TIERS:
            raise JaqynAPIException(
                "VALIDATION_ERROR", f"A ladder has at most {MAX_TIERS} levels"
            )
        if tiers and tiers[0]["min_visits"] != 0:
            raise JaqynAPIException(
                "VALIDATION_ERROR", "The first level must start at 0 visits"
            )
        names: set[str] = set()
        previous_visits = -1
        for tier in tiers:
            name = str(tier["name"]).strip()
            if not name or name.lower() in names:
                raise JaqynAPIException(
                    "VALIDATION_ERROR", "Every level needs a unique name"
                )
            names.add(name.lower())
            if tier["min_visits"] <= previous_visits:
                raise JaqynAPIException(
                    "VALIDATION_ERROR", "Level visit thresholds must increase"
                )
            previous_visits = tier["min_visits"]
            percent = Decimal(tier["cashback_percent"])
            if percent <= 0 or percent > 100:
                raise JaqynAPIException(
                    "VALIDATION_ERROR", "Cashback must be between 0 and 100 percent"
                )

    @classmethod
    def _validate(
        cls, values: dict[str, Any], existing: LoyaltyProgram | None = None
    ) -> None:
        """Validate the complete effective program config for its selected type.

        ``values`` may carry a ``tiers`` ladder (list of rung dicts). A ladder
        is only valid on a spend-basis points program; when one is present (in
        ``values`` or already saved) it replaces the flat ``points_per_som``
        earning-rate requirement, since each rung prices its own rate.
        """
        effective = (
            {
                field.name: getattr(existing, field.name)
                for field in LoyaltyProgram._meta.fields
            }
            if existing
            else {}
        )
        effective.update(values)
        tiers = values.get("tiers")
        if tiers is None and existing is not None:
            has_tiers = existing.tiers.exists()
        else:
            has_tiers = bool(tiers)
        if tiers:
            cls._validate_tiers(tiers)
        program_type = effective.get("type")
        if program_type == LoyaltyProgram.Type.POINTS:
            basis = effective.get("points_basis")
            cashback = effective.get("cashback_per_point")
            if (
                basis not in LoyaltyProgram.PointsBasis.values
                or cashback is None
                or Decimal(cashback) <= 0
            ):
                raise JaqynAPIException(
                    "VALIDATION_ERROR",
                    "Points programs require a basis and positive cashback rate",
                )
            if has_tiers and basis != LoyaltyProgram.PointsBasis.SPEND:
                raise JaqynAPIException(
                    "VALIDATION_ERROR",
                    "Status levels require a spend-basis points program",
                )
            rate = (
                effective.get("points_per_visit")
                if basis == LoyaltyProgram.PointsBasis.VISIT
                else effective.get("points_per_som")
            )
            if not has_tiers and (rate is None or Decimal(rate) <= 0):
                raise JaqynAPIException(
                    "VALIDATION_ERROR",
                    "Points programs require a positive earning rate",
                )
        elif program_type in {LoyaltyProgram.Type.STAMP, LoyaltyProgram.Type.VISIT}:
            if has_tiers:
                raise JaqynAPIException(
                    "VALIDATION_ERROR",
                    "Status levels require a spend-basis points program",
                )
            if not effective.get("required_count") or not effective.get("reward_type"):
                raise JaqynAPIException(
                    "VALIDATION_ERROR",
                    "Stamp and visit programs require a target and reward",
                )
            if effective.get("reward_type") == LoyaltyProgram.RewardType.CASHBACK:
                raise JaqynAPIException(
                    "VALIDATION_ERROR", "Cashback is reserved for points programs"
                )
            if effective.get(
                "item_selection"
            ) == LoyaltyProgram.ItemSelection.FIXED and not effective.get(
                "catalog_item"
            ):
                raise JaqynAPIException(
                    "VALIDATION_ERROR", "Fixed item rewards require a catalog item"
                )
        else:
            raise JaqynAPIException("VALIDATION_ERROR", "Unknown loyalty program type")

    @staticmethod
    def _replace_tiers(program: LoyaltyProgram, tiers: list[dict[str, Any]]) -> None:
        """Replace the program's status ladder wholesale with ``tiers``.

        The ladder is small (≤ ``MAX_TIERS``) and owner-edited as one unit, so
        delete-and-recreate keeps the write path trivially consistent — no
        per-rung diffing. Memberships are untouched: standing is derived from
        visit counts at read/earn time, never stored.
        """
        program.tiers.all().delete()
        LoyaltyTier.objects.bulk_create(
            LoyaltyTier(
                program=program,
                name=str(tier["name"]).strip(),
                min_visits=tier["min_visits"],
                cashback_percent=Decimal(tier["cashback_percent"]),
            )
            for tier in tiers
        )

    @classmethod
    def create(
        cls, business: Business, created_by: object, **values: Any
    ) -> LoyaltyProgram:
        """Create an active loyalty program owned by ``business`` after config
        validation, including its cashback status ladder when one is sent."""
        cls._validate(values)
        tiers = values.pop("tiers", None)
        with transaction.atomic():
            program = LoyaltyProgram.objects.create(
                business=business, created_by=created_by, **values
            )
            if tiers:
                cls._replace_tiers(program, tiers)
        return program

    @classmethod
    def update(cls, program: LoyaltyProgram, **values: Any) -> LoyaltyProgram:
        """Patch a program after validating its complete effective configuration.

        A ``tiers`` key replaces the whole status ladder (an empty list removes
        it); omitting the key leaves the saved ladder unchanged.
        """
        cls._validate(values, program)
        tiers = values.pop("tiers", None)
        with transaction.atomic():
            for field, value in values.items():
                setattr(program, field, value)
            program.save()
            if tiers is not None:
                cls._replace_tiers(program, tiers)
        return program

    @staticmethod
    def list_for_business(business: Business) -> QuerySet[LoyaltyProgram]:
        """Return a preloaded newest-first queryset for one business."""
        return (
            LoyaltyProgram.objects.filter(business=business)
            .select_related("catalog_item", "business")
            .prefetch_related("tiers")
            .order_by("-created_at")
        )

    @staticmethod
    def pause(program: LoyaltyProgram) -> LoyaltyProgram:
        """Pause an active program without discarding memberships or balances."""
        program.status = LoyaltyProgram.Status.PAUSED
        program.save(update_fields=["status", "updated_at"])
        return program

    @staticmethod
    def activate(program: LoyaltyProgram) -> LoyaltyProgram:
        """Activate a paused program after revalidating its saved configuration."""
        LoyaltyProgramService._validate({}, program)
        program.status = LoyaltyProgram.Status.ACTIVE
        program.save(update_fields=["status", "updated_at"])
        return program

    @staticmethod
    def archive(program: LoyaltyProgram) -> LoyaltyProgram:
        """Archive a program permanently from earning surfaces while retaining history."""
        program.status = LoyaltyProgram.Status.ARCHIVED
        program.save(update_fields=["status", "updated_at"])
        return program
