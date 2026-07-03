"""Patches models (campaigns-redesign spec §A).

Three tables:
- PatchDef: the 15 static achievement definitions (seeded via data migration).
- UserPatch: per-user progress and earned state.
- PatchBoardVisit: first-board-visit timestamp used to dismiss the NEW pill.
"""

from __future__ import annotations

from django.db import models

from core.fields import TimeStampedModel, UUIDModel


class PatchDef(UUIDModel):
    """One achievement definition.

    Seeded by 0002_seed_patch_defs.py (15 rows from dcscript-1.js DEF[]).
    ``rule_type`` + ``rule_params`` drive PatchProgressService evaluation.
    ``slug`` is the stable external identifier (also the JS id), unique.
    """

    class Shape(models.TextChoices):
        # Shape names are a closed set matching the SVG renderer in the frontend
        # patchSVG() component. Source: dcscript-1.js SHAPES dict.
        CIRCLE = "circle", "Circle"
        SHIELD = "shield", "Shield"
        HEXAGON = "hexagon", "Hexagon"
        BANNER = "banner", "Banner"

    class RuleType(models.TextChoices):
        # Covers all 15 patch definitions from dcscript-1.js DEF[].
        # Source: spec §A "Rule types" list.
        FIRST_EVENT = "FIRST_EVENT", "First event"
        DISTINCT_BUSINESSES = "DISTINCT_BUSINESSES", "Distinct businesses"
        CARDS_COMPLETED = "CARDS_COMPLETED", "Cards completed"
        TIME_OF_DAY = "TIME_OF_DAY", "Time of day"
        GROUP_LED = "GROUP_LED", "Group led"
        WEEKEND_STREAK = "WEEKEND_STREAK", "Weekend streak"
        SPEND_TOTAL = "SPEND_TOTAL", "Spend total"
        REFERRALS = "REFERRALS", "Referrals"
        DISTRICTS = "DISTRICTS", "Districts"

    slug = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=120)
    shape = models.CharField(max_length=16, choices=Shape.choices)
    icon = models.CharField(max_length=32)
    color = models.CharField(max_length=7)   # hex, e.g. "#C25E3C"
    light = models.CharField(max_length=7)
    deep = models.CharField(max_length=7)
    how = models.TextField()
    rule_type = models.CharField(max_length=32, choices=RuleType.choices)
    # JSON bag of rule parameters. Schema depends on rule_type:
    #   FIRST_EVENT:          {"event": "stamp_scanned"}
    #   DISTINCT_BUSINESSES:  {"n": 3, "category": "cafe"}  (category optional)
    #   CARDS_COMPLETED:      {"n": 5, "category": "bakery"}  (category optional)
    #   TIME_OF_DAY:          {"direction": "before"|"after", "time": "10:00"}
    #   GROUP_LED:            {"n": 1}
    #   WEEKEND_STREAK:       {"n": 3}
    #   SPEND_TOTAL:          {"som": 10000}
    #   REFERRALS:            {"n": 3}  (no-op evaluator in v1 — no referral data)
    #   DISTRICTS:            {"n": 3}  (no-op evaluator in v1 — no geo data)
    # Source: spec §A rule engine; dcscript-1.js DEF[] "how" strings.
    rule_params = models.JSONField(default=dict)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "slug"]

    def __str__(self) -> str:
        return f"{self.name} ({self.slug})"


class UserPatch(TimeStampedModel):
    """Per-user progress toward and earned state of one patch.

    Created lazily when the rule engine first evaluates the patch for a user.
    ``progress_current`` is recomputed from the appropriate ledger on each
    evaluate_patches task run; it is not a free-running counter — this keeps the
    source of truth in the existing ledgers and makes idempotency trivial.

    ``earned_at`` is set exactly once when ``progress_current >= progress_target``
    under a ``select_for_update`` lock inside PatchProgressService.handle_event.
    Re-running the evaluator while already earned is a no-op.

    ``seen_at`` is set when the customer acknowledges the earn moment (POST seen/).
    """

    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="user_patches",
    )
    patch = models.ForeignKey(
        PatchDef,
        on_delete=models.CASCADE,
        related_name="user_patches",
    )
    progress_current = models.PositiveIntegerField(default=0)
    # Copied from PatchDef.rule_params at row creation so the progress bar renders
    # even when rule_params changes; overwritten on each evaluation.
    progress_target = models.PositiveIntegerField(default=1)
    earned_at = models.DateTimeField(blank=True, null=True)
    seen_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "patch"], name="uniq_user_patch"
            )
        ]
        indexes = [
            models.Index(fields=["user", "earned_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.patch.slug}"


class PatchBoardVisit(UUIDModel):
    """Records the first time a customer visits the patch board.

    A single row per user (OneToOne). Created on POST /board-seen/ and used to
    dismiss the NEW pill on the patches row in the campaigns tab.
    Source: spec §A "PatchBoardVisit: user OneToOne, first_visited_at".
    """

    user = models.OneToOneField(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="patch_board_visit",
    )
    first_visited_at = models.DateTimeField()

    def __str__(self) -> str:
        return f"{self.user_id} @ {self.first_visited_at:%Y-%m-%d}"
