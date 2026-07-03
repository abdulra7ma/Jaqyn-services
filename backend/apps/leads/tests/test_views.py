import json

import pytest
from django.urls import reverse

from apps.leads.models import Lead, LeadColumn, LeadStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def staff(django_user_model):
    return django_user_model.objects.create_user(
        email="a@x.io", password="pw", is_staff=True
    )


def test_table_requires_staff(client, django_user_model):
    django_user_model.objects.create_user(email="j@x.io", password="pw")
    client.login(username="j@x.io", password="pw")
    resp = client.get(reverse("leads_api_table"))
    assert resp.status_code == 403


def test_table_returns_columns_and_rows(client, staff, django_assert_num_queries):
    client.force_login(staff)
    LeadColumn.objects.create(key="business_name", label="Business")
    status = LeadStatus.objects.create(name="Not contacted", is_default=True)
    Lead.objects.create(data={"business_name": "Ant`s"}, status=status, created_by=staff)
    with django_assert_num_queries(5):  # session + user (auth middleware) + columns + statuses + rows(select_related)
        resp = client.get(reverse("leads_api_table"))
    body = resp.json()
    assert body["rows"][0]["data"]["business_name"] == "Ant`s"
    assert body["columns"][0]["key"] == "business_name"


def test_upload_creates_rows(client, staff):
    client.force_login(staff)
    LeadStatus.objects.create(name="Not contacted", is_default=True)
    resp = client.post(
        reverse("leads_api_upload"),
        data=json.dumps([{"business_name": "Capito"}]),
        content_type="application/json",
    )
    assert resp.status_code == 200
    assert Lead.objects.count() == 1


def test_patch_row_updates_status(client, staff):
    client.force_login(staff)
    s1 = LeadStatus.objects.create(name="Not contacted", is_default=True)
    s2 = LeadStatus.objects.create(name="Won")
    lead = Lead.objects.create(data={}, status=s1, created_by=staff)
    resp = client.patch(
        reverse("leads_api_row", args=[lead.pk]),
        data=json.dumps({"status_id": s2.pk}),
        content_type="application/json",
    )
    assert resp.status_code == 200
    lead.refresh_from_db()
    assert lead.status_id == s2.pk


def test_create_row_with_payload_coerces_and_sets_status(client, staff):
    client.force_login(staff)
    status = LeadStatus.objects.create(name="Contacted", is_default=True)
    LeadColumn.objects.create(key="rating", label="Rating", type="number")
    resp = client.post(
        reverse("leads_api_rows"),
        data=json.dumps({"data": {"rating": "4.7"}, "status_id": status.pk}),
        content_type="application/json",
    )
    assert resp.status_code == 201
    lead = Lead.objects.get(pk=resp.json()["id"])
    assert lead.data["rating"] == 4.7  # coerced str -> float by the column type
    assert lead.status_id == status.pk
