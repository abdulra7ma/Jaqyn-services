from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import QuerySet

from apps.businesses.models import Business
from apps.loyalty.models import LoyaltyProgram
from core.exceptions import JaqynAPIException


class LoyaltyProgramService:
    """Create and manage ongoing programs while enforcing publishable configs."""

    @staticmethod
    def _validate(
        values: dict[str, Any], existing: LoyaltyProgram | None = None
    ) -> None:
        """Validate the complete effective program config for its selected type."""
        effective = (
            {
                field.name: getattr(existing, field.name)
                for field in LoyaltyProgram._meta.fields
            }
            if existing
            else {}
        )
        effective.update(values)
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
            rate = (
                effective.get("points_per_visit")
                if basis == LoyaltyProgram.PointsBasis.VISIT
                else effective.get("points_per_som")
            )
            if rate is None or Decimal(rate) <= 0:
                raise JaqynAPIException(
                    "VALIDATION_ERROR",
                    "Points programs require a positive earning rate",
                )
        elif program_type in {LoyaltyProgram.Type.STAMP, LoyaltyProgram.Type.VISIT}:
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

    @classmethod
    def create(
        cls, business: Business, created_by: object, **values: Any
    ) -> LoyaltyProgram:
        """Create an active loyalty program owned by ``business`` after config validation."""
        cls._validate(values)
        return LoyaltyProgram.objects.create(
            business=business, created_by=created_by, **values
        )

    @classmethod
    def update(cls, program: LoyaltyProgram, **values: Any) -> LoyaltyProgram:
        """Patch a program after validating its complete effective configuration."""
        cls._validate(values, program)
        for field, value in values.items():
            setattr(program, field, value)
        program.save()
        return program

    @staticmethod
    def list_for_business(business: Business) -> QuerySet[LoyaltyProgram]:
        """Return a preloaded newest-first queryset for one business."""
        return (
            LoyaltyProgram.objects.filter(business=business)
            .select_related("catalog_item", "business")
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
