from django.urls import path

from apps.loyalty.views import BusinessRewardDetailView, BusinessRewardListCreateView, RewardActivateView, RewardPauseView

urlpatterns = [
    path("", BusinessRewardListCreateView.as_view(), name="business-rewards"),
    path("<uuid:reward_id>/", BusinessRewardDetailView.as_view(), name="business-reward-detail"),
    path("<uuid:reward_id>/pause/", RewardPauseView.as_view(), name="business-reward-pause"),
    path("<uuid:reward_id>/activate/", RewardActivateView.as_view(), name="business-reward-activate"),
]
