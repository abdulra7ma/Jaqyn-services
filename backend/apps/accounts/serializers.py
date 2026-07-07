import datetime

from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import CustomerProfile, User

# Oldest birthday we accept. No verified person has lived past ~122 years, so a
# 1900 floor rejects fat-finger year entries (e.g. 0202) while staying safely
# below any real customer's DOB.
MIN_BIRTHDAY = datetime.date(1900, 1, 1)


class UserSerializer(serializers.ModelSerializer):
    avatar = serializers.SerializerMethodField()

    def get_avatar(self, obj):
        if obj.avatar:
            return obj.avatar.url
        return None

    class Meta:
        model = User
        fields = (
            "id", "phone", "name", "email", "role",
            "is_phone_verified", "is_email_verified",
            "created_at", "avatar", "avatar_emoji",
        )
        read_only_fields = fields


class CustomerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerProfile
        fields = ("birthday", "language", "marketing_opt_in", "onboarding_completed", "profile_completed")


class RequestOTPSerializer(serializers.Serializer):
    phone = serializers.RegexField(regex=r"^\+[1-9]\d{7,14}$")


class VerifyOTPSerializer(serializers.Serializer):
    phone = serializers.RegexField(regex=r"^\+[1-9]\d{7,14}$")
    code = serializers.CharField(min_length=4, max_length=6)


class PasswordLoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=255)
    password = serializers.CharField(max_length=128)


class ProfileUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False, allow_blank=True, allow_null=True)
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    phone = serializers.RegexField(
        regex=r"^\+[1-9]\d{7,14}$", required=False, allow_blank=True, allow_null=True
    )
    birthday = serializers.DateField(required=False, allow_null=True)
    language = serializers.ChoiceField(choices=CustomerProfile.Language.choices, required=False)
    marketing_opt_in = serializers.BooleanField(required=False)
    onboarding_completed = serializers.BooleanField(required=False)
    avatar_emoji = serializers.CharField(max_length=8, required=False, allow_blank=True)

    def validate_birthday(self, value: datetime.date | None) -> datetime.date | None:
        """Reject an implausible date of birth: a future date or one before 1900.

        A DOB in the future is never valid, and dates before ``MIN_BIRTHDAY``
        are fat-finger errors rather than real customers. ``None`` passes through
        so a user can clear the field.
        """
        if value is None:
            return value
        if value > timezone.localdate():
            raise serializers.ValidationError("Birthday cannot be in the future.")
        if value < MIN_BIRTHDAY:
            raise serializers.ValidationError("Birthday is too far in the past.")
        return value


class RequestEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    # Locale the client is currently displaying; an existing account's saved
    # CustomerProfile.language wins over this (see issue_email_otp).
    language = serializers.ChoiceField(
        choices=CustomerProfile.Language.choices, required=False, default=CustomerProfile.Language.RU
    )


class VerifyEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)


class RequestPasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()
    # Locale the client is currently displaying; an existing account's saved
    # CustomerProfile.language wins over this (see issue_password_reset_otp).
    language = serializers.ChoiceField(
        choices=CustomerProfile.Language.choices, required=False, default=CustomerProfile.Language.RU
    )


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(min_length=8, max_length=128)


class LoginResolveSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=255)


class GoogleAuthSerializer(serializers.Serializer):
    id_token = serializers.CharField()
