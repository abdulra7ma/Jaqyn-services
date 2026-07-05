"""Admin-side business onboarding.

Lets an employee create a fully-specified business from a single admin form (or a
pasted JSON blob), *without* an owner. The owner is attached later through the
pitch-link claim flow — so the pipeline is: admin pre-loads the prospect's
details here → generates a pitch link → the owner claims it and lands on the
(pre-filled) app onboarding. This keeps data entry in one place for the team.

The service is deliberately thin: shape/format validation lives in the admin
``BusinessOnboardForm``; this module only performs the create.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.utils import timezone

from apps.businesses.models import Business, CatalogItem
from apps.businesses.services import set_business_cover, set_business_logo
from core.logging import emit_event


@dataclass(frozen=True)
class CatalogDraft:
    """One catalog row supplied on the admin onboarding form / JSON import."""

    name: str
    category: str = ""
    price: str = ""
    duration: str = ""


def _to_decimal(value: Any) -> Optional[Decimal]:
    """Coerce a lat/lng value to Decimal, or None when blank/unparseable.

    Coordinates arrive as strings from the form (or numbers from JSON). A bad
    value is dropped rather than raising — the map coordinate is optional and a
    malformed one shouldn't block creating the business.
    """
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


@transaction.atomic
def onboard_business(
    *,
    fields: dict[str, Any],
    is_demo: bool = False,
    catalog: Optional[list[CatalogDraft]] = None,
    logo: Optional[UploadedFile] = None,
    cover: Optional[UploadedFile] = None,
) -> Business:
    """Create an owner-less business from admin-supplied fields.

    ``fields`` is the validated ``BusinessOnboardForm.cleaned_data`` (working_hours
    already a dict, tags already a list). Status depends on ``is_demo``:

    * ``is_demo=False`` (default): status PENDING, onboarding COMPLETED,
      verification PENDING — a real prospect awaiting the team's verification;
      claimable via a pitch link.
    * ``is_demo=True``: APPROVED + PUBLISHED + VERIFIED so it is immediately
      visible in the app for testing (mirrors ``create_demo_business`` minus the
      seeded owner login).

    Optional ``logo``/``cover`` uploads are compressed + stored via the existing
    brand-asset services. ``catalog`` rows with a non-blank name become active
    ``CatalogItem``s under the ``menu`` module.

    Returns the created business.
    """
    now = timezone.now()
    # area mirrors city so the business surfaces in the customer discovery filter
    # (which groups by area) without a second manual field.
    city = (fields.get("city") or "").strip()
    business = Business(
        name=fields["name"].strip(),
        legal_name=(fields.get("legal_name") or "").strip(),
        category=fields.get("category") or "",
        business_type=(fields.get("business_type") or "").strip(),
        description=(fields.get("description") or "").strip(),
        phone=(fields.get("phone") or "").strip(),
        public_email=(fields.get("public_email") or "") or None,
        website_url=(fields.get("website_url") or "") or None,
        instagram_url=(fields.get("instagram_url") or "") or None,
        address=(fields.get("address") or "").strip(),
        city=city,
        area=city,
        country=(fields.get("country") or "").strip() or "Kyrgyzstan",
        latitude=_to_decimal(fields.get("latitude")),
        longitude=_to_decimal(fields.get("longitude")),
        working_hours=fields.get("working_hours") or {},
        tags=fields.get("tags") or [],
        is_demo=is_demo,
    )
    if is_demo:
        business.status = Business.Status.APPROVED
        business.onboarding_status = Business.OnboardingStatus.COMPLETED
        business.verification_status = Business.VerificationStatus.VERIFIED
        business.visibility_status = Business.VisibilityStatus.PUBLISHED
        business.verified_at = now
        business.published_at = now
    else:
        business.status = Business.Status.PENDING
        business.onboarding_status = Business.OnboardingStatus.COMPLETED
        business.verification_status = Business.VerificationStatus.PENDING
    business.save()

    if logo:
        set_business_logo(business, logo)
    if cover:
        set_business_cover(business, cover)

    for order, item in enumerate(catalog or []):
        if not item.name.strip():
            continue
        CatalogItem.objects.create(
            business=business,
            module="menu",
            name=item.name.strip(),
            category=item.category.strip(),
            price=item.price.strip(),
            duration=item.duration.strip(),
            sort_order=order,
            is_active=True,
        )

    emit_event("admin_business_onboarded", business_id=str(business.id), is_demo=is_demo)
    return business
