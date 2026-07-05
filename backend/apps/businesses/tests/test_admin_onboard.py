import pytest
from django.urls import reverse

from apps.businesses.admin_onboard import BusinessOnboardForm
from apps.businesses.admin_onboard_services import CatalogDraft, onboard_business
from apps.businesses.models import Business

pytestmark = pytest.mark.django_db


def _fields(**over):
    base = {
        "name": "Manas Coffee",
        "legal_name": "",
        "category": "cafe",
        "business_type": "",
        "description": "Cozy roastery",
        "phone": "+996555000111",
        "public_email": "",
        "website_url": "",
        "instagram_url": "",
        "address": "Chuy 142",
        "city": "Bishkek",
        "country": "Kyrgyzstan",
        "latitude": "42.87",
        "longitude": "74.59",
        "working_hours": {"mon": ["09:00", "21:00"]},
        "tags": ["coffee"],
    }
    base.update(over)
    return base


def test_onboard_creates_pending_ownerless_business():
    biz = onboard_business(fields=_fields(), is_demo=False)
    assert biz.owner_id is None
    assert biz.status == Business.Status.PENDING
    assert biz.verification_status == Business.VerificationStatus.PENDING
    assert biz.onboarding_status == Business.OnboardingStatus.COMPLETED
    assert biz.name == "Manas Coffee"
    assert biz.area == biz.city == "Bishkek"  # area mirrors city
    from decimal import Decimal

    assert biz.latitude == Decimal("42.87")
    assert biz.working_hours == {"mon": ["09:00", "21:00"]}
    assert biz.tags == ["coffee"]


def test_onboard_demo_is_live_immediately():
    biz = onboard_business(fields=_fields(), is_demo=True)
    assert biz.is_demo is True
    assert biz.status == Business.Status.APPROVED
    assert biz.verification_status == Business.VerificationStatus.VERIFIED
    assert biz.visibility_status == Business.VisibilityStatus.PUBLISHED
    assert biz.published_at is not None


def test_onboard_creates_catalog_items():
    biz = onboard_business(
        fields=_fields(),
        catalog=[CatalogDraft(name="Latte", category="Coffee", price="190 c"), CatalogDraft(name="")],
    )
    items = list(biz.catalog_items.all())
    assert len(items) == 1  # blank-name row skipped
    assert items[0].name == "Latte"
    assert items[0].price == "190 c"


def test_bad_latitude_is_dropped_not_raised():
    biz = onboard_business(fields=_fields(latitude="not-a-number"))
    assert biz.latitude is None  # bad coord dropped, business still created


def test_form_parses_working_hours_and_tags():
    form = BusinessOnboardForm(
        data={
            "name": "X",
            "category": "cafe",
            "working_hours": '{"mon":["09:00","21:00"]}',
            "tags": "coffee, wifi ,  breakfast",
            "catalog_json": "",
        }
    )
    assert form.is_valid(), form.errors
    assert form.cleaned_data["working_hours"] == {"mon": ["09:00", "21:00"]}
    assert form.cleaned_data["tags"] == ["coffee", "wifi", "breakfast"]


def test_form_rejects_invalid_working_hours_json():
    form = BusinessOnboardForm(data={"name": "X", "category": "cafe", "working_hours": "{bad json"})
    assert not form.is_valid()
    assert "working_hours" in form.errors


def test_form_requires_name_and_category():
    form = BusinessOnboardForm(data={"name": "", "category": ""})
    assert not form.is_valid()
    assert "name" in form.errors
    assert "category" in form.errors


def test_view_get_renders_for_staff(client, django_user_model):
    staff = django_user_model.objects.create(phone="+996700111222", is_staff=True, is_superuser=True)
    staff.set_password("pw")
    staff.save()
    client.force_login(staff)
    resp = client.get(reverse("admin_business_onboard"))
    assert resp.status_code == 200
    assert b"Onboard a business" in resp.content
    assert b"Load from JSON" in resp.content


def test_view_post_creates_business(client, django_user_model):
    staff = django_user_model.objects.create(phone="+996700111333", is_staff=True, is_superuser=True)
    staff.set_password("pw")
    staff.save()
    client.force_login(staff)
    resp = client.post(
        reverse("admin_business_onboard"),
        data={"name": "Posted Cafe", "category": "cafe", "city": "Bishkek", "catalog_json": ""},
    )
    assert resp.status_code == 302  # redirect to the new business change page
    biz = Business.objects.get(name="Posted Cafe")
    assert biz.owner_id is None
    assert biz.status == Business.Status.PENDING
