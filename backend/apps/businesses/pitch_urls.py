from django.urls import path

from apps.businesses.pitch_views import PitchClaimView, PitchResolveView, PitchVerifyView

app_name = "pitch"

urlpatterns = [
    path("<str:token>/", PitchResolveView.as_view(), name="resolve"),
    path("<str:token>/claim/", PitchClaimView.as_view(), name="claim"),
    path("<str:token>/verify/", PitchVerifyView.as_view(), name="verify"),
]
