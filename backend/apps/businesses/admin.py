from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseNotAllowed
from django.shortcuts import get_object_or_404, redirect
from django.urls import path
from unfold.admin import ModelAdmin, TabularInline

from apps.businesses.models import (
    Business,
    BusinessNote,
    BusinessOwnerInvite,
    BusinessType,
    CatalogItem,
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


@admin.register(Business)
class BusinessAdmin(ModelAdmin):
    list_display = (
        "name", "owner", "pending_owner_name", "pending_owner_email",
        "category", "area", "status", "onboarding_status", "verification_status", "created_at",
    )
    list_filter = ("status", "onboarding_status", "verification_status", "category", "area")
    search_fields = ("name", "owner__phone", "phone", "address", "pending_owner_name", "pending_owner_email")
    # owner is rendered in list_display; join it to avoid a query per row.
    list_select_related = ("owner",)
    actions = [approve_businesses, reject_businesses, disable_businesses, request_changes]
    inlines = [BusinessNoteInline]

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
    list_display = ("name", "business", "module", "category", "price", "is_active")
    list_filter = ("module", "is_active")
    search_fields = ("name", "business__name")
    list_select_related = ("business",)


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
