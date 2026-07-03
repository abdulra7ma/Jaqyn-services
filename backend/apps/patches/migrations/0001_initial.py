"""Schema migration: PatchDef, UserPatch, PatchBoardVisit (spec §A)."""

from __future__ import annotations

import django.db.models.deletion
import uuid

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PatchDef",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("slug", models.CharField(max_length=64, unique=True)),
                ("name", models.CharField(max_length=120)),
                (
                    "shape",
                    models.CharField(
                        choices=[
                            ("circle", "Circle"),
                            ("shield", "Shield"),
                            ("hexagon", "Hexagon"),
                            ("banner", "Banner"),
                        ],
                        max_length=16,
                    ),
                ),
                ("icon", models.CharField(max_length=32)),
                ("color", models.CharField(max_length=7)),
                ("light", models.CharField(max_length=7)),
                ("deep", models.CharField(max_length=7)),
                ("how", models.TextField()),
                (
                    "rule_type",
                    models.CharField(
                        choices=[
                            ("FIRST_EVENT", "First event"),
                            ("DISTINCT_BUSINESSES", "Distinct businesses"),
                            ("CARDS_COMPLETED", "Cards completed"),
                            ("TIME_OF_DAY", "Time of day"),
                            ("GROUP_LED", "Group led"),
                            ("WEEKEND_STREAK", "Weekend streak"),
                            ("SPEND_TOTAL", "Spend total"),
                            ("REFERRALS", "Referrals"),
                            ("DISTRICTS", "Districts"),
                        ],
                        max_length=32,
                    ),
                ),
                ("rule_params", models.JSONField(default=dict)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={
                "ordering": ["sort_order", "slug"],
            },
        ),
        migrations.CreateModel(
            name="PatchBoardVisit",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("first_visited_at", models.DateTimeField()),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="patch_board_visit",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="UserPatch",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True),
                ),
                ("progress_current", models.PositiveIntegerField(default=0)),
                ("progress_target", models.PositiveIntegerField(default=1)),
                ("earned_at", models.DateTimeField(blank=True, null=True)),
                ("seen_at", models.DateTimeField(blank=True, null=True)),
                (
                    "patch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_patches",
                        to="patches.patchdef",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="user_patches",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
        migrations.AddConstraint(
            model_name="userpatch",
            constraint=models.UniqueConstraint(
                fields=["user", "patch"], name="uniq_user_patch"
            ),
        ),
        migrations.AddIndex(
            model_name="userpatch",
            index=models.Index(
                fields=["user", "earned_at"], name="patches_userpatch_user_earned_idx"
            ),
        ),
    ]
