"""Business logic for the leads admin tool.

Values live in ``Lead.data`` keyed by ``LeadColumn.key``. ``coerce_value``
validates each value against its column's type; ``import_leads`` ingests a JSON
array, auto-registering unknown keys as TEXT columns; ``compute_scores``
reimplements the 6 xlsx scoring formulas used to seed the Bishkek dataset.
"""

import math
from dataclasses import dataclass, field

from django.utils.text import slugify

from apps.leads.models import Lead, LeadColumn, LeadStatus


class LeadServiceError(Exception):
    """Base for lead service failures."""


class LeadValidationError(LeadServiceError):
    """A value does not satisfy its column's type or choices."""


# Qualitative → points maps come from the source xlsx SWITCH() formulas.
_REPEAT_MAP = {"High": 20, "Medium": 12, "Low": 6}
_YOUNG_MAP = {"High": 15, "Medium": 9, "Low": 4}
_LOCAL_MAP = {"High": 15, "Medium": 9, "Low": 4}
# Category substrings (EN + RU) that make a campaign "easy" — from the xlsx SEARCH() list.
_EASY_CATEGORY_TOKENS = (
    "coffee", "коф", "cafe", "каф", "barber", "salon", "beauty",
    "ногт", "пицц", "fast",
)


def coerce_value(column: LeadColumn, raw: object) -> object:
    """Validate/coerce ``raw`` for ``column``'s type. Raise LeadValidationError on mismatch.

    Empty/None passes through as None (a blank cell is always allowed).
    """
    if raw is None or raw == "":
        return None
    t = column.type
    if t == LeadColumn.ColumnType.NUMBER:
        try:
            return float(raw)
        except (TypeError, ValueError):
            raise LeadValidationError(f"{column.label}: '{raw}' is not a number")
    if t == LeadColumn.ColumnType.BOOLEAN:
        if isinstance(raw, bool):
            return raw
        if str(raw).lower() in {"true", "1", "yes"}:
            return True
        if str(raw).lower() in {"false", "0", "no"}:
            return False
        raise LeadValidationError(f"{column.label}: '{raw}' is not a boolean")
    if t == LeadColumn.ColumnType.SELECT:
        if str(raw) not in column.choices:
            raise LeadValidationError(f"{column.label}: '{raw}' not in choices")
        return str(raw)
    if t == LeadColumn.ColumnType.MULTISELECT:
        values = raw if isinstance(raw, list) else [raw]
        for v in values:
            if str(v) not in column.choices:
                raise LeadValidationError(f"{column.label}: '{v}' not in choices")
        return [str(v) for v in values]
    # TEXT, DATE, URL — stored as strings (DATE as ISO text; grid handles display).
    return str(raw)


def compute_scores(row: dict) -> dict:
    """Reimplement the xlsx scoring formulas. Returns the 6 scores + total + A/B/C."""
    rating = float(row.get("rating") or 0)
    reviews = float(row.get("review_count") or 0)
    category = str(row.get("category") or "").lower()
    rating_score = min(30.0, rating * 6)
    review_strength = min(10.0, math.log10(reviews + 1) * 3.5)
    repeat = _REPEAT_MAP.get(row.get("repeat_visit_potential"), 0)
    young = _YOUNG_MAP.get(row.get("young_smartphone_fit"), 0)
    local = _LOCAL_MAP.get(row.get("local_decision_maker_likelihood"), 0)
    ease = 10 if any(tok in category for tok in _EASY_CATEGORY_TOKENS) else 6
    total = min(100, round(rating_score + review_strength + repeat + young + local + ease))
    priority = "A" if total >= 80 else "B" if total >= 65 else "C"
    return {
        "rating_score": round(rating_score, 1),
        "review_strength_score": round(review_strength, 1),
        "repeat_score": repeat,
        "young_score": young,
        "local_decision_score": local,
        "campaign_ease_score": ease,
        "total_jaqyn_fit_score": total,
        "sales_priority": priority,
    }


@dataclass
class ImportResult:
    created: int = 0
    updated: int = 0
    new_columns: list[str] = field(default_factory=list)


def _default_status() -> LeadStatus | None:
    return LeadStatus.objects.filter(is_default=True).first() or LeadStatus.objects.first()


def import_leads(rows: list[dict], user) -> ImportResult:
    """Ingest a JSON array of objects as Lead rows.

    Unknown keys auto-register as TEXT columns. Each row is created with
    ``created_by=user`` and the default status. Raises LeadValidationError if the
    payload is not a list of dicts.
    """
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise LeadValidationError("Payload must be a JSON array of objects")
    known = set(LeadColumn.objects.values_list("key", flat=True))
    result = ImportResult()
    default_status = _default_status()
    max_order = LeadColumn.objects.count()
    for raw_row in rows:
        clean: dict = {}
        for raw_key, value in raw_row.items():
            key = slugify(raw_key).replace("-", "_")
            if key not in known:
                LeadColumn.objects.create(
                    key=key, label=raw_key, type=LeadColumn.ColumnType.TEXT, order=max_order
                )
                known.add(key)
                result.new_columns.append(key)
                max_order += 1
            clean[key] = value
        Lead.objects.create(data=clean, status=default_status, created_by=user)
        result.created += 1
    return result


def update_row(lead: Lead, data_patch: dict, status_id: int | None, user) -> Lead:
    """Coerce and apply a partial cell update and/or status change, then save."""
    columns = {c.key: c for c in LeadColumn.objects.all()}
    for key, value in data_patch.items():
        column = columns.get(key)
        lead.data[key] = coerce_value(column, value) if column else value
    if status_id is not None:
        lead.status = LeadStatus.objects.filter(pk=status_id).first()
    lead.save()
    return lead


def create_column(key: str, label: str, type: str, choices: list | None = None) -> LeadColumn:
    """Register a new column. ``key`` is slugified; raises on duplicate key."""
    slug = slugify(key).replace("-", "_")
    if LeadColumn.objects.filter(key=slug).exists():
        raise LeadValidationError(f"Column '{slug}' already exists")
    return LeadColumn.objects.create(
        key=slug, label=label, type=type, choices=choices or [],
        order=LeadColumn.objects.count(),
    )


def update_column(column: LeadColumn, **fields) -> LeadColumn:
    """Update a column's label/type/choices/order/visibility. Retype does not
    rewrite existing ``data`` blobs — incompatible values simply won't validate on
    their next edit. Only whitelisted fields are applied."""
    allowed = {"label", "type", "choices", "order", "is_visible", "editable"}
    for name, value in fields.items():
        if name in allowed:
            setattr(column, name, value)
    column.save()
    return column
