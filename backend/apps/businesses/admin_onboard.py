"""Custom admin page: onboard a business from one form (or a pasted JSON blob).

``BusinessOnboardForm`` is the single source of truth for the field set — the
rendered form, the JSON import keys, and the copy-paste LLM prompt are all derived
from it, so they can never drift (a key the prompt emits but the form ignores would
silently vanish otherwise).

Registered at ``/admin/businesses/onboard/`` (see ``config/urls.py``) behind
``admin.site.admin_view`` (staff + add-permission gated in the view).
"""

from __future__ import annotations

import json
from typing import Any

from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.shortcuts import redirect, render
from django.urls import reverse

from apps.businesses.admin_onboard_services import CatalogDraft, onboard_business
from apps.businesses.models import Business

# Fields the JSON importer/LLM should NOT try to fill: file uploads (a browser
# cannot set a file input programmatically) and the demo toggle (a deliberate
# human choice, not business data). Everything else is importable.
_IMPORT_EXCLUDE = frozenset({"logo", "cover", "is_demo", "catalog_json"})


class BusinessOnboardForm(forms.Form):
    """One-tab business creation form. Field names are the canonical JSON keys."""

    name = forms.CharField(label="Business name", max_length=255)
    legal_name = forms.CharField(label="Legal name", max_length=255, required=False)
    category = forms.ChoiceField(
        label="Category",
        # blank first so the employee makes a deliberate choice
        choices=[("", "— select —"), *Business.Category.choices],
    )
    business_type = forms.CharField(
        label="Business type key",
        max_length=64,
        required=False,
        help_text="Optional — a seeded BusinessType key (e.g. cafe). Drives the app's setup sections.",
    )
    description = forms.CharField(
        label="Description",
        widget=forms.Textarea(attrs={"rows": 3}),
        required=False,
    )
    phone = forms.CharField(label="Primary phone", max_length=32, required=False)
    public_email = forms.EmailField(label="Public email", required=False)
    website_url = forms.URLField(label="Website", required=False, assume_scheme="https")
    instagram_url = forms.CharField(label="Instagram", max_length=255, required=False)
    address = forms.CharField(label="Address", max_length=255, required=False)
    city = forms.CharField(label="City", max_length=128, required=False, initial="Bishkek")
    country = forms.CharField(label="Country", max_length=128, required=False, initial="Kyrgyzstan")
    latitude = forms.CharField(label="Latitude", required=False)
    longitude = forms.CharField(label="Longitude", required=False)
    working_hours = forms.CharField(
        label="Working hours (JSON)",
        widget=forms.Textarea(attrs={"rows": 2}),
        required=False,
        help_text='Structured, e.g. {"mon":["09:00","21:00"],"sat":["10:00","16:00"]}. Leave blank if unknown.',
    )
    tags = forms.CharField(
        label="Tags",
        required=False,
        help_text="Comma-separated, e.g. coffee, wifi, breakfast.",
    )
    # Optional brand assets — manual picks only (JSON can't set a file input).
    logo = forms.ImageField(label="Logo", required=False)
    cover = forms.ImageField(label="Cover image", required=False)
    is_demo = forms.BooleanField(
        label="Create as demo (approved & visible immediately)",
        required=False,
        help_text="Off = a real prospect: PENDING, awaiting verification, claimable via a pitch link.",
    )
    # Filled by the JSON importer / the Catalog tab JS; parsed in clean().
    catalog_json = forms.CharField(widget=forms.HiddenInput, required=False)

    def clean_working_hours(self) -> dict:
        raw = (self.cleaned_data.get("working_hours") or "").strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            raise forms.ValidationError("Not valid JSON — expected an object like {\"mon\":[\"09:00\",\"21:00\"]}.")
        if not isinstance(parsed, dict):
            raise forms.ValidationError("Working hours must be a JSON object keyed by weekday.")
        return parsed

    def clean_tags(self) -> list[str]:
        raw = (self.cleaned_data.get("tags") or "").strip()
        return [t.strip() for t in raw.split(",") if t.strip()]

    def clean_catalog_json(self) -> list[CatalogDraft]:
        raw = (self.cleaned_data.get("catalog_json") or "").strip()
        if not raw:
            return []
        try:
            rows = json.loads(raw)
        except json.JSONDecodeError:
            raise forms.ValidationError("Catalog data could not be read (invalid JSON).")
        if not isinstance(rows, list):
            return []
        drafts: list[CatalogDraft] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            drafts.append(
                CatalogDraft(
                    name=str(row.get("name", "")),
                    category=str(row.get("category", "")),
                    price=str(row.get("price", "")),
                    duration=str(row.get("duration", "")),
                )
            )
        return drafts


def _import_fields(form: BusinessOnboardForm) -> list[dict[str, Any]]:
    """Metadata for the importable text fields, derived from the form itself.

    Used to render the JSON importer's confirm modal and to build the LLM prompt —
    one derivation so keys/labels never drift from the actual form.
    """
    meta: list[dict[str, Any]] = []
    for name, field in form.fields.items():
        if name in _IMPORT_EXCLUDE:
            continue
        meta.append({"name": name, "label": str(field.label or name), "required": field.required})
    return meta


def _llm_prompt(fields: list[dict[str, Any]]) -> str:
    """Ready-to-paste prompt: given business info, emit JSON with our exact keys."""
    lines = [f'  "{f["name"]}": ""{"  // required" if f["required"] else ""}' for f in fields]
    keys_block = ",\n".join(lines)
    return (
        "You are helping onboard a business onto the Jaqyn loyalty platform. "
        "From the business information I give you (website text, social profile, notes), "
        "produce ONE JSON object and nothing else, using EXACTLY these keys "
        "(leave a value as an empty string if unknown):\n\n"
        "{\n"
        f"{keys_block},\n"
        '  "working_hours": {"mon": ["09:00", "21:00"]},   // object keyed by mon..sun, or {} if unknown\n'
        '  "tags": ["coffee", "wifi"],                       // short keyword list\n'
        '  "catalog": [{"name": "Cappuccino", "category": "Coffee", "price": "180 c", "duration": ""}]\n'
        "}\n\n"
        "Rules: category must be one of: "
        + ", ".join(c[0] for c in Business.Category.choices)
        + ". latitude/longitude as decimal strings. Do not invent data you were not given.\n\n"
        "Business information:\n<paste it here>"
    )


def onboard_business_view(request: Any):
    """Render + handle the one-tab admin business-onboarding page.

    GET renders the form (empty or with imported values); POST validates the form
    and creates the business via the service, then redirects to its change page.
    Add-permission gated — creating businesses is an add operation.
    """
    if not request.user.has_perm("businesses.add_business"):
        raise PermissionDenied

    if request.method == "POST":
        form = BusinessOnboardForm(request.POST, request.FILES)
        if form.is_valid():
            business = onboard_business(
                fields=form.cleaned_data,
                is_demo=form.cleaned_data["is_demo"],
                catalog=form.cleaned_data["catalog_json"],
                logo=form.cleaned_data.get("logo"),
                cover=form.cleaned_data.get("cover"),
            )
            messages.success(
                request,
                f"Business “{business.name}” created "
                f"({'demo · live' if business.is_demo else 'pending · generate a pitch link to hand off'}).",
            )
            return redirect(reverse("admin:businesses_business_change", args=[business.id]))
        messages.error(request, "Please fix the highlighted fields.")
    else:
        form = BusinessOnboardForm()

    import_fields = _import_fields(form)
    context = {
        **admin.site.each_context(request),
        "title": "Onboard a business",
        "form": form,
        "import_fields": import_fields,
        "import_fields_json": json.dumps(import_fields),
        "llm_prompt": _llm_prompt(import_fields),
    }
    return render(request, "admin/businesses/onboard_business.html", context)
