from django.urls import path

from apps.loyalty.views import (
    ActivateProgramView,
    ArchiveProgramView,
    BusinessProgramDetailView,
    BusinessProgramListCreateView,
    PauseProgramView,
)

urlpatterns = [
    path(
        "programs/",
        BusinessProgramListCreateView.as_view(),
        name="business-loyalty-programs",
    ),
    path(
        "programs/<uuid:program_id>/",
        BusinessProgramDetailView.as_view(),
        name="business-loyalty-program-detail",
    ),
    path(
        "programs/<uuid:program_id>/pause/",
        PauseProgramView.as_view(),
        name="business-loyalty-pause",
    ),
    path(
        "programs/<uuid:program_id>/activate/",
        ActivateProgramView.as_view(),
        name="business-loyalty-activate",
    ),
    path(
        "programs/<uuid:program_id>/archive/",
        ArchiveProgramView.as_view(),
        name="business-loyalty-archive",
    ),
]
