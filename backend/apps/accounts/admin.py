from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from unfold.admin import ModelAdmin
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

from apps.accounts.models import CustomerProfile, User
from core.admin import image_thumb


@admin.register(User)
class UserAdmin(DjangoUserAdmin, ModelAdmin):
    # Unfold-styled auth forms so the add/password screens match the themed admin.
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm
    list_display = ("avatar_thumb", "phone", "name", "role", "is_phone_verified", "is_active", "is_staff", "created_at")

    @admin.display(description="")
    def avatar_thumb(self, obj: User):
        return image_thumb(obj.avatar, size=28, radius=14)
    list_filter = ("role", "is_phone_verified", "is_active", "is_staff")
    search_fields = ("phone", "name", "email")
    ordering = ("-created_at",)
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        ("Profile", {"fields": ("name", "email", "role", "is_phone_verified")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login",)}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("phone", "password1", "password2", "role", "is_staff", "is_superuser"),
        }),
    )


@admin.register(CustomerProfile)
class CustomerProfileAdmin(ModelAdmin):
    list_display = ("user", "birthday", "language", "marketing_opt_in", "created_at")
    list_filter = ("language", "marketing_opt_in")
    search_fields = ("user__phone", "user__name", "user__email")
    list_select_related = ("user",)
