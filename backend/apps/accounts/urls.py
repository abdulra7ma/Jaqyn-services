from django.urls import path

from apps.accounts.views import (
    AvatarUploadView,
    LogoutView,
    MeView,
    PasswordLoginView,
    ProfileView,
    RequestOTPView,
    VerifyOTPView,
)

urlpatterns = [
    path("request-otp/", RequestOTPView.as_view(), name="request-otp"),
    path("verify-otp/", VerifyOTPView.as_view(), name="verify-otp"),
    path("login-password/", PasswordLoginView.as_view(), name="login-password"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("avatar/", AvatarUploadView.as_view(), name="avatar-upload"),
]
