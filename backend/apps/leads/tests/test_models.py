import pytest

from apps.leads.models import Lead, LeadColumn, LeadStatus

pytestmark = pytest.mark.django_db


def test_lead_str_uses_business_name():
    lead = Lead.objects.create(data={"business_name": "Ant`s"})
    assert str(lead) == "Ant`s"


def test_column_defaults_to_text():
    col = LeadColumn.objects.create(key="notes", label="Notes")
    assert col.type == LeadColumn.ColumnType.TEXT
    assert col.choices == []


def test_status_ordering():
    LeadStatus.objects.create(name="Won", order=2)
    LeadStatus.objects.create(name="New", order=1)
    assert [s.name for s in LeadStatus.objects.all()] == ["New", "Won"]
