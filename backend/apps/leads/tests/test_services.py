import pytest

from apps.leads import services
from apps.leads.models import Lead, LeadColumn, LeadStatus

pytestmark = pytest.mark.django_db


def test_coerce_number_rejects_non_numeric():
    col = LeadColumn.objects.create(key="rating", label="Rating", type="number")
    assert services.coerce_value(col, "4.7") == 4.7
    with pytest.raises(services.LeadValidationError):
        services.coerce_value(col, "nope")


def test_coerce_select_enforces_choices():
    col = LeadColumn.objects.create(key="fit", label="Fit", type="select", choices=["High", "Low"])
    assert services.coerce_value(col, "High") == "High"
    with pytest.raises(services.LeadValidationError):
        services.coerce_value(col, "Medium")


def test_compute_scores_boundaries():
    row = {
        "rating": 4.7, "review_count": 3450, "category": "Coffee / urban cafe",
        "repeat_visit_potential": "High", "young_smartphone_fit": "High",
        "local_decision_maker_likelihood": "Medium",
    }
    scores = services.compute_scores(row)
    assert scores["rating_score"] == 28.2  # min(30, 4.7*6)
    assert scores["campaign_ease_score"] == 10  # matches "coffee"
    assert scores["sales_priority"] in {"A", "B", "C"}
    assert 0 <= scores["total_jaqyn_fit_score"] <= 100


def test_import_registers_unknown_columns_and_sets_creator(django_user_model):
    # accounts.User has no username field; email is the identity field here.
    user = django_user_model.objects.create(email="r@x.io")
    LeadStatus.objects.create(name="Not contacted", is_default=True)
    result = services.import_leads([{"business_name": "Ant`s", "weird_key": "x"}], user)
    assert result.created == 1
    assert "weird_key" in result.new_columns
    lead = Lead.objects.get()
    assert lead.created_by == user
    assert lead.status.name == "Not contacted"
