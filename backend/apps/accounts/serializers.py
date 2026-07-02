from rest_framework import serializers

from apps.accounts.models import CustomerProfile, User


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
    birthday = serializers.DateField(required=False, allow_null=True)
    language = serializers.ChoiceField(choices=CustomerProfile.Language.choices, required=False)
    marketing_opt_in = serializers.BooleanField(required=False)
    onboarding_completed = serializers.BooleanField(required=False)
    avatar_emoji = serializers.CharField(max_length=8, required=False, allow_blank=True)


class RequestEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=255)
    password = serializers.CharField(min_length=8, max_length=128)
    phone = serializers.RegexField(
        regex=r"^\+[1-9]\d{7,14}$", required=False, allow_blank=True, allow_null=True
    )


class VerifyEmailOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)


class RequestPasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(min_length=8, max_length=128)


class LoginResolveSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=255)
