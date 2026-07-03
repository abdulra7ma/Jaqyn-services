"""Serializers for the patches customer API (spec §A).

GET /api/customer/patches/ response shape (verbatim from spec):
{
  "earned_count": 7,
  "total": 15,
  "board_seen": false,
  "next": {
    "slug", "name", "shape", "icon", "color", "light", "deep",
    "current", "target", "remaining_label"
  } | null,
  "unseen_earned": [PatchOut],
  "patches": [PatchOut]
}

PatchOut = {
  slug, name, shape, icon, color, light, deep, how,
  earned, earned_at, progress_current, progress_target
}
"""

from __future__ import annotations

from rest_framework import serializers



class PatchOutSerializer(serializers.Serializer):
    """PatchOut: the shape for each patch in the list (earned + locked)."""

    slug = serializers.CharField()
    name = serializers.CharField()
    shape = serializers.CharField()
    icon = serializers.CharField()
    color = serializers.CharField()
    light = serializers.CharField()
    deep = serializers.CharField()
    how = serializers.CharField()
    earned = serializers.BooleanField()
    earned_at = serializers.DateTimeField(allow_null=True)
    progress_current = serializers.IntegerField()
    progress_target = serializers.IntegerField()


class PatchNextSerializer(serializers.Serializer):
    """The closest-to-earning unearned patch for the hero nudge."""

    slug = serializers.CharField()
    name = serializers.CharField()
    shape = serializers.CharField()
    icon = serializers.CharField()
    color = serializers.CharField()
    light = serializers.CharField()
    deep = serializers.CharField()
    current = serializers.IntegerField()
    target = serializers.IntegerField()
    remaining_label = serializers.CharField()


class PatchListResponseSerializer(serializers.Serializer):
    """Full response for GET /api/customer/patches/."""

    earned_count = serializers.IntegerField()
    total = serializers.IntegerField()
    board_seen = serializers.BooleanField()
    next = PatchNextSerializer(allow_null=True)
    unseen_earned = PatchOutSerializer(many=True)
    patches = PatchOutSerializer(many=True)


class MarkPatchesSeenSerializer(serializers.Serializer):
    """POST /seen/ — list of slugs to mark seen_at."""

    slugs = serializers.ListField(
        child=serializers.CharField(max_length=64),
        min_length=1,
        max_length=24,
    )


class MarkBoardSeenSerializer(serializers.Serializer):
    """POST /board-seen/ — empty body; creates PatchBoardVisit."""

    pass
