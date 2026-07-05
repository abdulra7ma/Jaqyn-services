from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseNotAllowed
from django.shortcuts import get_object_or_404, redirect
from django.urls import path
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import action

from apps.businesses.demo_services import create_demo_business
from apps.businesses.models import (
    Business,
    BusinessNote,
    BusinessOwnerInvite,
    BusinessType,
    CatalogItem,
    PitchInvite,
    StaffInvite,
)
from apps.businesses.onboarding_services import request_changes as onboarding_request_changes
from apps.businesses.onboarding_services import verify_business
from apps.businesses.services import (
    add_business_note,
    approve_business,
    disable_business,
    reject_business,
    request_business_changes,
)
from apps.businesses.trial_services import trial_status
from core.admin import image_thumb


@admin.action(description="Mark selected as demo")
def mark_as_demo(modeladmin, request, queryset):
    updated = queryset.update(is_demo=True)
    messages.success(request, f"Marked {updated} business(es) as demo.")


@admin.action(description="Approve selected businesses")
def approve_businesses(modeladmin, request, queryset):
    for business in queryset:
        approve_business(business, request.user)


@admin.action(description="Reject selected businesses")
def reject_businesses(modeladmin, request, queryset):
    for business in queryset:
        reject_business(business, request.user)


@admin.action(description="Disable selected businesses")
def disable_businesses(modeladmin, request, queryset):
    for business in queryset:
        disable_business(business, request.user)


@admin.action(description="Request onboarding changes (add the detail as a note)")
def request_changes(modeladmin, request, queryset):
    # Transitions onboarding_status → CHANGES_REQUESTED. The reviewer records the
    # specific feedback as an inline CHANGES_REQUESTED note on each business.
    for business in queryset:
        request_business_changes(business, request.user, reason="See onboarding notes")


class BusinessNoteInline(TabularInline):
    model = BusinessNote
    extra = 0
    fields = ("kind", "body", "author", "status_at_note", "created_at")
    # author/status_at_note/created_at are set by the service layer or on save;
    # surfacing them read-only keeps the thread an auditable record.
    readonly_fields = ("author", "status_at_note", "created_at")
    ordering = ("-created_at",)

    def has_change_permission(self, request, obj=None):
        # Notes are append-only — existing entries are never edited.
        return False


class PitchInviteInline(TabularInline):
    """Read-only audit trail of pitch invites for this business."""

    model = PitchInvite
    extra = 0
    can_delete = False
    fields = ("status", "created_at", "expires_at", "opened_at", "claimed_at", "claimed_email")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Business)
class BusinessAdmin(ModelAdmin):
    list_display = (
        "logo_thumb", "name", "owner", "trial_badge", "is_demo",
        "category", "area", "status", "onboarding_status", "verification_status",
        "pitch_status", "created_at",
    )
    list_filter = ("status", "onboarding_status", "verification_status", "is_demo", "is_paid", "category", "area")
    search_fields = ("name", "owner__phone", "phone", "address", "pending_owner_name", "pending_owner_email")
    # owner is rendered in list_display; join it to avoid a query per row.
    list_select_related = ("owner",)
    # Brand-asset previews on the detail page (read-only; uploads happen in-app).
    readonly_fields = ("logo_preview", "cover_preview")
    actions = [approve_businesses, reject_businesses, disable_businesses, request_changes, mark_as_demo]
    # Changelist-level button (unfold renders it at the top of the list).
    actions_list = ["create_demo_business_button"]
    # Change-form button to generate a pitch link for this specific business.
    actions_detail = ["create_pitch_link_button"]
    inlines = [BusinessNoteInline, PitchInviteInline]

    @admin.display(description="")
    def logo_thumb(self, obj: Business):
        """Small lazy-loaded logo for the changelist (no query; logo is a field)."""
        return image_thumb(obj.logo, size=32)

    @admin.display(description="Logo")
    def logo_preview(self, obj: Business):
        return image_thumb(obj.logo, size=120, radius=10)

    @admin.display(description="Cover")
    def cover_preview(self, obj: Business):
        return image_thumb(obj.cover_image, size=160, radius=10)

    @admin.display(description="Trial")
    def trial_badge(self, obj: Business) -> str:
        """Coloured trial pill for the changelist (query-free via trial_status)."""
        st = trial_status(obj)
        if not st.badge:
            return "—"
        bg, fg = ("#FBEAF0", "#9E3D52") if st.expired else ("#F6E5DC", "#8A3C26")
        return format_html(
            '<span style="background:{};color:{};border-radius:10px;padding:1px 8px;font-size:12px;">{}</span>',
            bg, fg, st.badge,
        )

    def get_queryset(self, request):
        # Prefetch invites (newest first via model Meta.ordering) so pitch_status
        # never issues a per-row query.
        return super().get_queryset(request).prefetch_related("pitch_invites")

    @admin.display(description="Pitch")
    def pitch_status(self, obj):
        """Render the latest pitch-invite status as a label for the changelist.

        Returns "— Не отправлено" when no invite exists; otherwise the Russian
        label for the invite's status. Reads obj.pitch_invites (prefetched via
        get_queryset to avoid N+1).
        """
        invite = next(iter(obj.pitch_invites.all()), None)
        if invite is None:
            return "— Не отправлено"
        labels = {
            PitchInvite.Status.PENDING: "Создано",
            PitchInvite.Status.OPENED: "Открыто",
            PitchInvite.Status.CLAIMED: "Забрано",
            PitchInvite.Status.EXPIRED: "Истекло",
        }
        return labels.get(invite.status, invite.status)

    @action(description="Создать pitch-ссылку", icon="link")
    def create_pitch_link_button(self, request, object_id):
        """Mint a fresh pitch link for this business and show the URL once.

        Expires any existing active (pending/opened) invite first so there is a
        single live link per business. The raw token is surfaced only in this
        message and never stored.
        """
        from django.conf import settings

        from apps.businesses.pitch_services import generate_pitch_invite

        business = self.get_object(request, object_id)
        business.pitch_invites.filter(
            status__in=[PitchInvite.Status.PENDING, PitchInvite.Status.OPENED]
        ).update(status=PitchInvite.Status.EXPIRED)
        _, raw = generate_pitch_invite(business)
        # The pitch page renders on the customer-facing frontend, not the admin
        # host. This request originates from the Django admin (backend origin), so
        # header-derived origins (frontend_base_url) would point the link at the
        # backend, which has no /pitch/ route. Always use the configured frontend.
        url = f"{settings.FRONTEND_URL}/pitch/{raw}"
        messages.success(
            request,
            format_html(
                "Pitch-ссылка (активна 30 дней, показана один раз): <code>{}</code>",
                url,
            ),
        )
        return redirect(request.META.get("HTTP_REFERER", "."))

    @action(description="Create demo business", icon="add_business")
    def create_demo_business_button(self, request):
        """Seed a demo business + owner login and report the credentials.

        Triggered by the changelist button (a GET link — acceptable for this
        admin-only, add-permission-gated convenience). Redirects back to the list.
        """
        if not self.has_add_permission(request):
            raise PermissionDenied
        result = create_demo_business()
        messages.success(
            request,
            format_html(
                "Demo business <strong>{}</strong> created. Owner login — "
                "email <code>{}</code> · phone <code>{}</code> · password <code>{}</code>",
                result.business.name, result.owner_email, result.owner_phone, result.password,
            ),
        )
        return redirect("admin:businesses_business_changelist")

    def get_urls(self):
        # Inline action endpoint used by the dashboard review/onboarding queues.
        custom = [
            path(
                "<uuid:pk>/dashboard-action/",
                self.admin_site.admin_view(self.dashboard_action_view),
                name="businesses_business_dashboard_action",
            ),
        ]
        return custom + super().get_urls()

    def dashboard_action_view(self, request, pk):
        """Apply an inline approve/reject/comment/verify/request-changes action.

        POST-only; re-uses the service layer (no business logic here) and
        redirects back to the dashboard with a status message. Requires change
        permission. ``action`` selects the operation; ``text`` carries the
        optional reject reason / comment body / change-request note.
        """
        if request.method != "POST":
            return HttpResponseNotAllowed(["POST"])
        if not self.has_change_permission(request):
            raise PermissionDenied
        business = get_object_or_404(Business, pk=pk)
        action = request.POST.get("action", "")
        text = request.POST.get("text", "").strip()

        if action == "approve":
            approve_business(business, request.user)
            messages.success(request, f"Approved {business.name}.")
        elif action == "reject":
            reject_business(business, request.user, reason=text or None)
            messages.success(request, f"Rejected {business.name}.")
        elif action == "comment":
            if not text:
                messages.warning(request, "Comment was empty — nothing added.")
            else:
                add_business_note(business, body=text, author=request.user)
                messages.success(request, f"Note added to {business.name}.")
        elif action == "verify":
            verify_business(business)
            messages.success(request, f"Verified & published {business.name}.")
        elif action == "request_changes":
            onboarding_request_changes(business, note=text)
            # Mirror the change request onto the note thread for the audit trail.
            add_business_note(
                business, body=text or "Changes requested",
                kind=BusinessNote.Kind.CHANGES_REQUESTED, author=request.user,
            )
            messages.success(request, f"Sent {business.name} back for changes.")
        else:
            messages.error(request, "Unknown dashboard action.")
        return redirect("admin:index")

    def save_formset(self, request, form, formset, change):
        # Stamp the acting admin and a status snapshot onto notes added inline.
        instances = formset.save(commit=False)
        for obj in formset.deleted_objects:
            obj.delete()
        for instance in instances:
            if isinstance(instance, BusinessNote):
                if instance.author_id is None:
                    instance.author = request.user
                if not instance.status_at_note:
                    instance.status_at_note = instance.business.status
            instance.save()
        formset.save_m2m()


@admin.register(BusinessNote)
class BusinessNoteAdmin(ModelAdmin):
    list_display = ("business", "kind", "short_body", "author", "status_at_note", "created_at")
    list_filter = ("kind",)
    search_fields = ("business__name", "body", "author__phone")
    list_select_related = ("business", "author")
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Note")
    def short_body(self, obj: BusinessNote) -> str:
        return (obj.body[:80] + "…") if len(obj.body) > 80 else obj.body


@admin.register(BusinessType)
class BusinessTypeAdmin(ModelAdmin):
    list_display = ("key", "name", "module", "sort_order", "is_active")
    list_editable = ("sort_order", "is_active")


@admin.register(CatalogItem)
class CatalogItemAdmin(ModelAdmin):
    list_display = ("item_thumb", "name", "business", "module", "category", "price", "is_active")
    list_filter = ("module", "is_active")
    search_fields = ("name", "business__name")
    list_select_related = ("business",)

    @admin.display(description="")
    def item_thumb(self, obj: CatalogItem):
        return image_thumb(obj.image, size=32)


@admin.register(StaffInvite)
class StaffInviteAdmin(ModelAdmin):
    list_display = ("full_name", "contact", "business", "role", "status", "created_at")
    list_filter = ("role", "status")
    search_fields = ("full_name", "contact", "business__name")
    list_select_related = ("business",)


@admin.register(BusinessOwnerInvite)
class BusinessOwnerInviteAdmin(ModelAdmin):
    list_display = ("email", "phone", "business", "status", "expires_at", "accepted_at")
    list_filter = ("status",)
    search_fields = ("email", "phone", "business__name")
    list_select_related = ("business",)
