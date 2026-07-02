import pytest
from django.core.management import call_command

from apps.leads.models import Lead, LeadColumn, LeadStatus

pytestmark = pytest.mark.django_db


def test_seed_is_idempotent(django_user_model):
    # accounts.User has no username field; USERNAME_FIELD = "phone", so use email only.
    django_user_model.objects.create_user(email="seedbot@x.io", is_staff=True)
    call_command("seed_leads")
    first = Lead.objects.count()
    assert first == 120
    assert LeadStatus.objects.filter(is_default=True).exists()
    assert LeadColumn.objects.filter(key="total_jaqyn_fit_score", type="number").exists()
    call_command("seed_leads")  # second run must not duplicate
    assert Lead.objects.count() == first
