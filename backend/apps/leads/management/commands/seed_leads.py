"""Seed the leads table from the committed Bishkek 2GIS fixture.

Idempotent: registers the column schema + status pipeline (get_or_create) and
only inserts lead rows when the table is empty. Scores are already computed in
the fixture (see the generator in the plan / services.compute_scores)."""

import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.leads.models import Lead, LeadColumn, LeadStatus

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "bishkek_leads.json"

# key → (label, type, choices). Order follows the source sheet.
COLUMN_SCHEMA: list[tuple[str, str, str, list[str]]] = [
    ("area", "Area", "select", []),  # choices filled from data at seed time
    ("priority_rank_in_area", "Priority Rank in Area", "number", []),
    ("business_name", "Business Name", "text", []),
    ("category", "Category", "text", []),
    ("address", "Address", "text", []),
    ("rating", "Rating", "number", []),
    ("review_count", "Review Count", "number", []),
    ("source_map", "Source Map", "select", []),
    ("2gis_source_url", "2GIS Source URL", "url", []),
    ("google_maps_search_url", "Google Maps Search URL", "url", []),
    ("tags_public_evidence", "Tags / Public Evidence", "text", []),
    ("repeat_visit_potential", "Repeat Visit Potential", "select", ["High", "Medium", "Low"]),
    ("young_smartphone_fit", "Young / Smartphone Fit", "select", ["High", "Medium", "Low"]),
    ("local_decision_maker_likelihood", "Local Decision Maker Likelihood", "select", ["High", "Medium", "Low"]),
    ("franchise_local_type", "Franchise / Local Type", "select", []),
    ("suggested_first_campaign", "Suggested First Campaign", "text", []),
    ("last_checked", "Last Checked", "date", []),
    ("field_notes", "Field Notes", "text", []),
    ("rating_score", "Rating Score", "number", []),
    ("review_strength_score", "Review Strength Score", "number", []),
    ("repeat_score", "Repeat Score", "number", []),
    ("young_score", "Young Score", "number", []),
    ("local_decision_score", "Local Decision Score", "number", []),
    ("campaign_ease_score", "Campaign Ease Score", "number", []),
    ("total_jaqyn_fit_score", "Total Jaqyn Fit Score", "number", []),
    ("sales_priority", "Sales Priority", "select", ["A", "B", "C"]),
]

# Pipeline seeded once; "Not contacted" is the source sheet's only value → default.
STATUS_PIPELINE: list[tuple[str, str, bool]] = [
    ("Not contacted", "#8C7A6A", True),
    ("Contacted", "#B07A1E", False),
    ("Interested", "#4E6B9D", False),
    ("Negotiating", "#E7A23E", False),
    ("Won", "#3F7355", False),
    ("Lost", "#B0563A", False),
]


class Command(BaseCommand):
    help = "Seed the leads table from the Bishkek 2GIS fixture (idempotent)."

    def handle(self, *args, **options) -> None:
        rows = json.loads(FIXTURE.read_text())
        # Fill select choices that come from the data (area, source_map, franchise).
        dynamic = {"area": set(), "source_map": set(), "franchise_local_type": set()}
        for row in rows:
            for k in dynamic:
                if row["data"].get(k):
                    dynamic[k].add(row["data"][k])
        for order, (key, label, ctype, choices) in enumerate(COLUMN_SCHEMA):
            LeadColumn.objects.get_or_create(
                key=key,
                defaults={"label": label, "type": ctype,
                          "choices": choices or sorted(dynamic.get(key, [])), "order": order},
            )
        statuses = {}
        for order, (name, color, is_default) in enumerate(STATUS_PIPELINE):
            statuses[name], _ = LeadStatus.objects.get_or_create(
                name=name, defaults={"color": color, "order": order, "is_default": is_default}
            )
        if Lead.objects.exists():
            self.stdout.write("Leads already present — skipping row insert.")
            return
        creator = get_user_model().objects.filter(is_staff=True).order_by("id").first()
        default_status = statuses["Not contacted"]
        Lead.objects.bulk_create([
            Lead(data=row["data"],
                 status=statuses.get(row["status"], default_status),
                 created_by=creator)
            for row in rows
        ])
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(rows)} leads."))
