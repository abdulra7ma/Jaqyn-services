from django.urls import path

from apps.accounts.views import (
    AvatarUploadView,
    GoogleAuthView,
    LoginResolveView,
    LogoutView,
    MeView,
    PasswordLoginView,
    ProfileView,
    RequestEmailOTPView,
    RequestOTPView,
    RequestPasswordResetView,
    ResetPasswordView,
    VerifyEmailOTPView,
    VerifyOTPView,
)

urlpatterns = [
    path("login/resolve/", LoginResolveView.as_view(), name="login-resolve"),
    path("request-otp/", RequestOTPView.as_view(), name="request-otp"),
    path("verify-otp/", VerifyOTPView.as_view(), name="verify-otp"),
    path("request-email-otp/", RequestEmailOTPView.as_view(), name="request-email-otp"),
    path("verify-email-otp/", VerifyEmailOTPView.as_view(), name="verify-email-otp"),
    path("google/", GoogleAuthView.as_view(), name="google-auth"),
    path("login-password/", PasswordLoginView.as_view(), name="login-password"),
    path("request-password-reset/", RequestPasswordResetView.as_view(), name="request-password-reset"),
    path("reset-password/", ResetPasswordView.as_view(), name="reset-password"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("avatar/", AvatarUploadView.as_view(), name="avatar-upload"),
]
