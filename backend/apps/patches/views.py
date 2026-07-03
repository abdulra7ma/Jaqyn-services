"""Customer patch API views (spec §A).

Endpoints under /api/customer/patches/:
  GET  /          — list all patches with progress for the requesting customer.
  POST /seen/     — mark earn-moment as shown (sets seen_at on UserPatch rows).
  POST /board-seen/ — mark the patch board as first visited (dismisses NEW pill).

All IsCustomer. Writes are throttled. List is N+1-free (single query + prefetch).
"""

from __future__ import annotations

from django.utils import timezone
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.patches.models import PatchBoardVisit, PatchDef, UserPatch
from apps.patches.serializers import (
    MarkBoardSeenSerializer,
    MarkPatchesSeenSerializer,
    PatchListResponseSerializer,
)
from core.permissions import IsCustomer
from core.response import success_response


def _build_patch_out(patch_def: PatchDef, user_patch: UserPatch | None) -> dict:
    """Build a PatchOut dict for one def, merging in user progress."""
    earned = user_patch is not None and user_patch.earned_at is not None
    return {
        "slug": patch_def.slug,
        "name": patch_def.name,
        "shape": patch_def.shape,
        "icon": patch_def.icon,
        "color": patch_def.color,
        "light": patch_def.light,
        "deep": patch_def.deep,
        "how": patch_def.how,
        "earned": earned,
        "earned_at": user_patch.earned_at if user_patch else None,
        "progress_current": user_patch.progress_current if user_patch else 0,
        "progress_target": user_patch.progress_target if user_patch else 1,
    }


class PatchListView(APIView):
    """GET /api/customer/patches/ — board data for the requesting customer.

    Single query over PatchDef + one UserPatch filter; no N+1.
    Response shape per spec §A.
    """

    permission_classes = [IsCustomer]
    serializer_class = PatchListResponseSerializer

    def get(self, request):
        customer = request.user
        # One query for all active defs (≤ 24 rows, small fixed set).
        all_defs = list(PatchDef.objects.filter(is_active=True).order_by("sort_order"))
        # One query for this customer's progress rows.
        user_patches = {
            up.patch_id: up
            for up in UserPatch.objects.filter(
                user=customer,
                patch__is_active=True,
            ).select_related("patch")
        }

        board_seen = PatchBoardVisit.objects.filter(user=customer).exists()

        patches_out = [
            _build_patch_out(d, user_patches.get(d.id)) for d in all_defs
        ]

        earned_patches = [p for p in patches_out if p["earned"]]
        earned_count = len(earned_patches)
        total = len(all_defs)

        # Unseen earned: earned but seen_at not yet set.
        def _is_unseen_earned(patch_def: PatchDef, p_out: dict) -> bool:
            up = user_patches.get(patch_def.id)
            return p_out["earned"] and (up is None or up.seen_at is None)

        unseen_earned = [
            p_out
            for d, p_out in zip(all_defs, patches_out)
            if _is_unseen_earned(d, p_out)
        ]

        # Next: highest-progress unearned patch (closest to threshold).
        unearned = [p for p in patches_out if not p["earned"]]
        next_patch = None
        if unearned:
            # Pick the one with the highest ratio current/target (closest to done).
            best = max(
                unearned,
                key=lambda p: p["progress_current"] / max(p["progress_target"], 1),
            )
            remaining = best["progress_target"] - best["progress_current"]
            next_patch = {
                "slug": best["slug"],
                "name": best["name"],
                "shape": best["shape"],
                "icon": best["icon"],
                "color": best["color"],
                "light": best["light"],
                "deep": best["deep"],
                "current": best["progress_current"],
                "target": best["progress_target"],
                "remaining_label": f"{remaining} to go",
            }

        data = {
            "earned_count": earned_count,
            "total": total,
            "board_seen": board_seen,
            "next": next_patch,
            "unseen_earned": unseen_earned,
            "patches": patches_out,
        }
        return success_response(data)


class MarkPatchesSeenView(APIView):
    """POST /api/customer/patches/seen/ — mark earn-moment shown.

    Sets seen_at on UserPatch rows for the given slugs if earned and not yet seen.
    Idempotent (already-seen rows are skipped via the seen_at__isnull filter).
    Throttled to prevent abuse.
    """

    permission_classes = [IsCustomer]
    serializer_class = MarkPatchesSeenSerializer
    throttle_scope = "patches_write"

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def post(self, request):
        ser = MarkPatchesSeenSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        slugs: list[str] = ser.validated_data["slugs"]
        now = timezone.now()
        updated = UserPatch.objects.filter(
            user=request.user,
            patch__slug__in=slugs,
            earned_at__isnull=False,
            seen_at__isnull=True,
        ).update(seen_at=now, updated_at=now)
        return success_response({"marked": updated})


class MarkBoardSeenView(APIView):
    """POST /api/customer/patches/board-seen/ — dismiss NEW pill.

    Creates PatchBoardVisit for the customer (idempotent via get_or_create).
    Throttled.
    """

    permission_classes = [IsCustomer]
    serializer_class = MarkBoardSeenSerializer
    throttle_scope = "patches_write"

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def post(self, request):
        _, created = PatchBoardVisit.objects.get_or_create(
            user=request.user,
            defaults={"first_visited_at": timezone.now()},
        )
        return success_response({"created": created})
