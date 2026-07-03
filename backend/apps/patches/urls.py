from django.urls import path

from apps.patches.views import MarkBoardSeenView, MarkPatchesSeenView, PatchListView

urlpatterns = [
    path("", PatchListView.as_view(), name="patch-list"),
    path("seen/", MarkPatchesSeenView.as_view(), name="patch-mark-seen"),
    path("board-seen/", MarkBoardSeenView.as_view(), name="patch-board-seen"),
]
