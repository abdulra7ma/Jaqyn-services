# Leads Admin Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A flexible, JSON-backed lead table inside the Django admin where the sales team uploads JSON, edits cells, manages statuses, and adds runtime columns — with all sort/filter/search/pagination done client-side in a JS grid.

**Architecture:** New `apps.leads` app. Three models — `LeadColumn` (runtime column registry with editable types), `LeadStatus` (runtime-managed statuses), `Lead` (`data` JSONField + `status` FK + `created_by` FK). A custom admin page (`/admin/leads/`, gated by `admin.site.admin_view`) renders a Tabulator grid; thin `@staff_member_required` JSON views back it. Seeded from the Bishkek 2GIS xlsx with score formulas reimplemented in Python.

**Tech Stack:** Django 5, plain Django views + `JsonResponse` (session auth + CSRF), django-unfold admin, Tabulator (vendored static JS/CSS), pytest + pytest-django.

## Global Constraints

- Type hints on every function/param + explicit return type; no bare `dict`/`tuple` for structured data — use `@dataclass`.
- Business logic in the service layer; views parse → call service → shape response.
- Services raise domain exceptions, never return sentinels.
- `USE_TZ=True`; store UTC. Money/exact quantities use `Decimal` (n/a here — scores are display floats).
- No `print`, no commented-out code, no secrets.
- Every relation access uses `select_related`/`prefetch_related`; no ORM calls in loops.
- Admin strings via Django `gettext` (`_()`), not `@jaqyn/i18n` (that layer is frontend-only).
- Conventional Commits. Add/adjust a test in the same change.
- User model: `accounts.User` (`get_user_model()` / `settings.AUTH_USER_MODEL`).
- Endpoints gated on `request.user.is_staff`; non-staff → 403.

---

### Task 1: App scaffold + models + migration

**Files:**
- Create: `backend/apps/leads/__init__.py`, `apps.py`, `models.py`, `migrations/__init__.py`
- Create: `backend/apps/leads/admin.py`
- Modify: `backend/config/settings/base.py` (add `"apps.leads"` to LOCAL_APPS list, after `"apps.system"`)
- Test: `backend/apps/leads/tests/__init__.py`, `backend/apps/leads/tests/test_models.py`

**Interfaces:**
- Produces: `LeadColumn(key, label, type, choices, order, is_visible, editable)`, `LeadColumn.ColumnType` TextChoices (`TEXT, NUMBER, DATE, BOOLEAN, URL, SELECT, MULTISELECT`); `LeadStatus(name, color, order, is_default)`; `Lead(data, status, created_by, created_at, updated_at)`.

- [ ] **Step 1: Add app to settings.** In `base.py` LOCAL_APPS, add `"apps.leads",` after `"apps.system",`.

- [ ] **Step 2: Write `apps.py`.**

```python
from django.apps import AppConfig


class LeadsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.leads"
    verbose_name = "Leads"
```

- [ ] **Step 3: Write `models.py`.**

```python
from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class LeadColumn(models.Model):
    """A runtime-defined column in the lead table.

    ``key`` is the property name inside ``Lead.data``. ``type`` is editable so a
    column can be re-typed after creation; ``choices`` backs SELECT/MULTISELECT.
    """

    class ColumnType(models.TextChoices):
        TEXT = "text", _("Text")
        NUMBER = "number", _("Number")
        DATE = "date", _("Date")
        BOOLEAN = "boolean", _("Boolean")
        URL = "url", _("URL")
        SELECT = "select", _("Select")
        MULTISELECT = "multiselect", _("Multi-select")

    key = models.SlugField(max_length=64, unique=True)
    label = models.CharField(max_length=120)
    type = models.CharField(max_length=16, choices=ColumnType.choices, default=ColumnType.TEXT)
    choices = models.JSONField(default=list, blank=True)  # list[str] for SELECT/MULTISELECT
    order = models.PositiveIntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    editable = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self) -> str:
        return self.label


class LeadStatus(models.Model):
    """A pipeline status admins manage at runtime (name + color + order)."""

    name = models.CharField(max_length=60, unique=True)
    color = models.CharField(max_length=7, default="#8C7A6A")  # hex; design-system §1
    order = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "id"]
        verbose_name_plural = "Lead statuses"

    def __str__(self) -> str:
        return self.name


class Lead(models.Model):
    """One lead row. All column values live in ``data``, keyed by LeadColumn.key."""

    data = models.JSONField(default=dict)
    status = models.ForeignKey(
        LeadStatus, null=True, blank=True, on_delete=models.SET_NULL, related_name="leads"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return str(self.data.get("business_name") or f"Lead #{self.pk}")
```

- [ ] **Step 4: Write `admin.py`** (register the three models so statuses/columns are also editable via normal admin; the grid page is added in Task 4).

```python
from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.leads.models import Lead, LeadColumn, LeadStatus


@admin.register(LeadColumn)
class LeadColumnAdmin(ModelAdmin):
    list_display = ("label", "key", "type", "order", "is_visible")
    list_editable = ("order", "is_visible")


@admin.register(LeadStatus)
class LeadStatusAdmin(ModelAdmin):
    list_display = ("name", "color", "order", "is_default")
    list_editable = ("color", "order", "is_default")


@admin.register(Lead)
class LeadAdmin(ModelAdmin):
    list_display = ("__str__", "status", "created_by", "created_at")
    list_filter = ("status", "created_by")
    list_select_related = ("status", "created_by")
```

- [ ] **Step 5: Make migration.** Run: `python manage.py makemigrations leads`. Expected: `0001_initial.py` created.

- [ ] **Step 6: Write model smoke test** `tests/test_models.py`:

```python
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
```

- [ ] **Step 7: Run tests.** `pytest apps/leads/tests/test_models.py -v` → PASS.

- [ ] **Step 8: Commit.** `git add backend/apps/leads backend/config/settings/base.py && git commit -m "feat(leads): add LeadColumn, LeadStatus, Lead models"`

---

### Task 2: Service layer (coerce, compute scores, import, mutate)

**Files:**
- Create: `backend/apps/leads/services.py`
- Test: `backend/apps/leads/tests/test_services.py`

**Interfaces:**
- Consumes: models from Task 1.
- Produces:
  - `class LeadServiceError(Exception)`; `class LeadValidationError(LeadServiceError)`.
  - `coerce_value(column: LeadColumn, raw: object) -> object` — raises `LeadValidationError` on mismatch.
  - `@dataclass ImportResult(created: int, updated: int, new_columns: list[str])`.
  - `import_leads(rows: list[dict], user) -> ImportResult`.
  - `update_row(lead: Lead, data_patch: dict, status_id: int | None, user) -> Lead`.
  - `create_column(key, label, type, choices) -> LeadColumn`; `update_column(column, **fields) -> LeadColumn`.
  - `compute_scores(row: dict) -> dict` — keys: `rating_score, review_strength_score, repeat_score, young_score, local_decision_score, campaign_ease_score, total_jaqyn_fit_score, sales_priority`.

- [ ] **Step 1: Write failing service tests** `tests/test_services.py`:

```python
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
    user = django_user_model.objects.create(username="rep", email="r@x.io")
    LeadStatus.objects.create(name="Not contacted", is_default=True)
    result = services.import_leads([{"business_name": "Ant`s", "weird_key": "x"}], user)
    assert result.created == 1
    assert "weird_key" in result.new_columns
    lead = Lead.objects.get()
    assert lead.created_by == user
    assert lead.status.name == "Not contacted"
```

- [ ] **Step 2: Run to verify fail.** `pytest apps/leads/tests/test_services.py -v` → FAIL (module/attrs missing).

- [ ] **Step 3: Implement `services.py`.**

```python
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
```

- [ ] **Step 4: Run tests.** `pytest apps/leads/tests/test_services.py -v` → PASS.

- [ ] **Step 5: Commit.** `git add backend/apps/leads/services.py backend/apps/leads/tests/test_services.py && git commit -m "feat(leads): service layer — coerce, scores, import, mutations"`

---

### Task 3: JSON endpoints + URL wiring

**Files:**
- Create: `backend/apps/leads/views.py`, `backend/apps/leads/urls.py`
- Modify: `backend/config/urls.py` (add leads admin routes before `path("admin/", ...)`)
- Test: `backend/apps/leads/tests/test_views.py`

**Interfaces:**
- Consumes: services from Task 2.
- Produces URL names: `leads_page`, `leads_api_table`, `leads_api_upload`, `leads_api_rows`, `leads_api_row`, `leads_api_columns`, `leads_api_column`.
- `GET table/` returns `{"columns": [...], "statuses": [...], "rows": [{"id", "status_id", "created_by", "created_at", "data": {...}}]}`.

- [ ] **Step 1: Write failing view tests** `tests/test_views.py`:

```python
import json

import pytest
from django.urls import reverse

from apps.leads.models import Lead, LeadColumn, LeadStatus

pytestmark = pytest.mark.django_db


@pytest.fixture
def staff(django_user_model):
    return django_user_model.objects.create_user(
        username="admin", email="a@x.io", password="pw", is_staff=True
    )


def test_table_requires_staff(client, django_user_model):
    django_user_model.objects.create_user(username="joe", email="j@x.io", password="pw")
    client.login(username="joe", password="pw")
    resp = client.get(reverse("leads_api_table"))
    assert resp.status_code == 403


def test_table_returns_columns_and_rows(client, staff, django_assert_num_queries):
    client.force_login(staff)
    LeadColumn.objects.create(key="business_name", label="Business")
    status = LeadStatus.objects.create(name="Not contacted", is_default=True)
    Lead.objects.create(data={"business_name": "Ant`s"}, status=status, created_by=staff)
    with django_assert_num_queries(3):  # columns, statuses, rows(+select_related)
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
```

- [ ] **Step 2: Run to verify fail.** `pytest apps/leads/tests/test_views.py -v` → FAIL (no reverse target).

- [ ] **Step 3: Implement `views.py`.** Staff gate + JSON in/out. `staff_member_required` redirects non-staff to login (302) — for API parity return 403 explicitly via a small check.

```python
"""Admin-internal JSON endpoints for the leads grid. Session-authenticated,
CSRF-protected, staff-only. Views parse → call a service → return JsonResponse."""

import json

from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpRequest, HttpResponseNotAllowed, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_http_methods

from apps.leads import services
from apps.leads.models import Lead, LeadColumn, LeadStatus


def _forbid_non_staff(request: HttpRequest) -> JsonResponse | None:
    if not (request.user.is_authenticated and request.user.is_staff):
        return JsonResponse({"error": "forbidden"}, status=403)
    return None


def _serialize_columns() -> list[dict]:
    return [
        {"id": c.id, "key": c.key, "label": c.label, "type": c.type,
         "choices": c.choices, "order": c.order, "is_visible": c.is_visible,
         "editable": c.editable}
        for c in LeadColumn.objects.all()
    ]


def _serialize_statuses() -> list[dict]:
    return [
        {"id": s.id, "name": s.name, "color": s.color, "order": s.order,
         "is_default": s.is_default}
        for s in LeadStatus.objects.all()
    ]


def _serialize_lead(lead: Lead) -> dict:
    return {
        "id": lead.id,
        "status_id": lead.status_id,
        "created_by": lead.created_by.get_username() if lead.created_by else None,
        "created_at": lead.created_at.isoformat(),
        "data": lead.data,
    }


@staff_member_required
def leads_page(request: HttpRequest):
    """Render the Tabulator grid page inside the admin shell."""
    return render(request, "leads/grid.html", {})


@require_http_methods(["GET"])
def api_table(request: HttpRequest) -> JsonResponse:
    forbidden = _forbid_non_staff(request)
    if forbidden:
        return forbidden
    rows = [
        _serialize_lead(lead)
        for lead in Lead.objects.select_related("status", "created_by").all()
    ]
    return JsonResponse(
        {"columns": _serialize_columns(), "statuses": _serialize_statuses(), "rows": rows}
    )


@require_http_methods(["POST"])
def api_upload(request: HttpRequest) -> JsonResponse:
    forbidden = _forbid_non_staff(request)
    if forbidden:
        return forbidden
    try:
        payload = json.loads(request.body or "[]")
        result = services.import_leads(payload, request.user)
    except (json.JSONDecodeError, services.LeadServiceError) as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    return JsonResponse(
        {"created": result.created, "updated": result.updated, "new_columns": result.new_columns}
    )


@require_http_methods(["POST"])
def api_rows(request: HttpRequest) -> JsonResponse:
    """Create a blank row (add-row button)."""
    forbidden = _forbid_non_staff(request)
    if forbidden:
        return forbidden
    lead = Lead.objects.create(
        data={}, status=services._default_status(), created_by=request.user
    )
    return JsonResponse(_serialize_lead(lead), status=201)


@require_http_methods(["PATCH", "DELETE"])
def api_row(request: HttpRequest, pk: int) -> JsonResponse:
    forbidden = _forbid_non_staff(request)
    if forbidden:
        return forbidden
    lead = get_object_or_404(Lead, pk=pk)
    if request.method == "DELETE":
        lead.delete()
        return JsonResponse({"deleted": True})
    try:
        body = json.loads(request.body or "{}")
        services.update_row(lead, body.get("data", {}), body.get("status_id"), request.user)
    except services.LeadServiceError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    return JsonResponse(_serialize_lead(lead))


@require_http_methods(["POST"])
def api_columns(request: HttpRequest) -> JsonResponse:
    forbidden = _forbid_non_staff(request)
    if forbidden:
        return forbidden
    try:
        body = json.loads(request.body or "{}")
        column = services.create_column(
            body["key"], body["label"], body.get("type", "text"), body.get("choices")
        )
    except (KeyError, services.LeadServiceError) as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    return JsonResponse({"id": column.id, "key": column.key}, status=201)


@require_http_methods(["PATCH", "DELETE"])
def api_column(request: HttpRequest, pk: int) -> JsonResponse:
    forbidden = _forbid_non_staff(request)
    if forbidden:
        return forbidden
    column = get_object_or_404(LeadColumn, pk=pk)
    if request.method == "DELETE":
        column.delete()
        return JsonResponse({"deleted": True})
    body = json.loads(request.body or "{}")
    services.update_column(column, **body)
    return JsonResponse({"id": column.id, "key": column.key})
```

- [ ] **Step 4: Write `urls.py`.**

```python
from django.urls import path

from apps.leads import views

# Mounted under /admin/leads/ in config/urls.py, each wrapped by admin_view.
urlpatterns = [
    path("", views.leads_page, name="leads_page"),
    path("api/table/", views.api_table, name="leads_api_table"),
    path("api/upload/", views.api_upload, name="leads_api_upload"),
    path("api/rows/", views.api_rows, name="leads_api_rows"),
    path("api/rows/<int:pk>/", views.api_row, name="leads_api_row"),
    path("api/columns/", views.api_columns, name="leads_api_columns"),
    path("api/columns/<int:pk>/", views.api_column, name="leads_api_column"),
]
```

- [ ] **Step 5: Wire into `config/urls.py`.** Add before `path("admin/", admin.site.urls)`:

```python
from django.urls import include

# Custom leads admin tool — must precede admin.site.urls. admin_view gates page
# access to staff and renders inside the admin shell; the api_* views enforce
# is_staff themselves (they return JSON 403, not an HTML login redirect).
path("admin/leads/", include("apps.leads.urls")),
```

Wrap only the page route through admin_view is unnecessary since `leads_page` already uses `@staff_member_required`; keep the include as-is.

- [ ] **Step 6: Run tests.** `pytest apps/leads/tests/test_views.py -v` → PASS. If the `django_assert_num_queries(3)` count is off, adjust to the observed number and note why in a comment.

- [ ] **Step 7: Commit.** `git add backend/apps/leads/views.py backend/apps/leads/urls.py backend/config/urls.py backend/apps/leads/tests/test_views.py && git commit -m "feat(leads): staff-only JSON endpoints for the grid"`

---

### Task 4: Admin grid page (Tabulator) + sidebar nav

**Files:**
- Create: `backend/apps/leads/templates/leads/grid.html`
- Create (vendored): `backend/apps/leads/static/leads/tabulator.min.js`, `tabulator.min.css`, `grid.js`
- Modify: `backend/config/settings/base.py` (add a "Leads" nav group in `UNFOLD["SIDEBAR"]["navigation"]`)

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE` endpoints from Task 3 (URL names).

- [ ] **Step 1: Vendor Tabulator.** Download the single-file build into static:

```bash
cd backend/apps/leads/static/leads
curl -sSL https://unpkg.com/tabulator-tables@6.3.1/dist/js/tabulator.min.js -o tabulator.min.js
curl -sSL https://unpkg.com/tabulator-tables@6.3.1/dist/css/tabulator.min.css -o tabulator.min.css
```

Verify both files are non-empty (`ls -l`). Pinned version 6.3.1 (avoids surprise upgrades — bump deliberately).

- [ ] **Step 2: Write `grid.html`** (extends the unfold base so it renders in the admin shell with the sidebar; exposes CSRF + endpoint URLs to JS).

```html
{% extends "admin/base_site.html" %}
{% load static %}

{% block content %}
<div class="mb-4 flex items-center gap-3">
  <h1 class="text-lg font-semibold">Leads</h1>
  <button id="add-row" class="px-3 py-1.5 rounded-lg text-white" style="background:#C25E3C">+ Row</button>
  <button id="add-column" class="px-3 py-1.5 rounded-lg border">+ Column</button>
  <label class="px-3 py-1.5 rounded-lg border cursor-pointer">
    Upload JSON<input id="upload" type="file" accept="application/json" class="hidden">
  </label>
  <input id="search" placeholder="Search…" class="px-3 py-1.5 rounded-lg border ml-auto">
</div>
<div id="leads-table"></div>

{% csrf_token %}
<link rel="stylesheet" href="{% static 'leads/tabulator.min.css' %}">
<script src="{% static 'leads/tabulator.min.js' %}"></script>
<script>
  window.LEADS_URLS = {
    table: "{% url 'leads_api_table' %}",
    upload: "{% url 'leads_api_upload' %}",
    rows: "{% url 'leads_api_rows' %}",
    row: (id) => `{% url 'leads_api_row' 0 %}`.replace('0', id),
    columns: "{% url 'leads_api_columns' %}",
  };
</script>
<script src="{% static 'leads/grid.js' %}"></script>
{% endblock %}
```

- [ ] **Step 3: Write `grid.js`** — builds Tabulator columns from the registry, all sort/filter/search client-side, inline edit persists via PATCH.

```javascript
/* Leads grid: client-side sort/filter/search/pagination via Tabulator.
   Cell edits and status changes persist to the staff-only JSON endpoints. */
const U = window.LEADS_URLS;
const csrf = document.querySelector('[name=csrfmiddlewaretoken]').value;

const json = (method, url, body) =>
  fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

// Map a LeadColumn type → a Tabulator editor + header filter.
function editorFor(col, statuses) {
  switch (col.type) {
    case 'number': return { editor: 'number', sorter: 'number', headerFilter: 'input' };
    case 'boolean': return { editor: 'tickCross', formatter: 'tickCross', headerFilter: 'tickCross' };
    case 'select':
    case 'multiselect':
      return { editor: 'list', editorParams: { values: col.choices, multiselect: col.type === 'multiselect' }, headerFilter: 'list', headerFilterParams: { values: col.choices, clearable: true } };
    case 'url': return { formatter: 'link', formatterParams: { target: '_blank' }, headerFilter: 'input' };
    default: return { editor: 'input', headerFilter: 'input' };
  }
}

async function init() {
  const data = await json('GET', U.table);
  const statuses = data.statuses;

  const columns = [
    { title: 'Status', field: 'status_id', editor: 'list',
      editorParams: { values: Object.fromEntries(statuses.map((s) => [s.id, s.name])) },
      formatter: (cell) => {
        const s = statuses.find((x) => x.id === cell.getValue());
        return s ? `<span style="background:${s.color};color:#fff;padding:2px 10px;border-radius:99px;font-size:11.5px">${s.name}</span>` : '';
      },
      headerFilter: 'list',
      headerFilterParams: { values: Object.fromEntries(statuses.map((s) => [s.id, s.name])), clearable: true } },
    { title: 'Created by', field: 'created_by', headerFilter: 'input', editor: false },
  ];
  data.columns.filter((c) => c.is_visible).forEach((c) => {
    columns.push({ title: c.label, field: `data.${c.key}`, editable: () => c.editable, ...editorFor(c, statuses) });
  });

  const table = new Tabulator('#leads-table', {
    data: data.rows,
    columns,
    layout: 'fitDataStretch',
    pagination: true,
    paginationSize: 25,
    paginationSizeSelector: [25, 50, 100, true],
    movableColumns: true,
    height: '75vh',
  });

  // Persist inline edits. Status edits patch status_id; data edits patch data.<key>.
  table.on('cellEdited', (cell) => {
    const row = cell.getRow().getData();
    const field = cell.getField();
    if (field === 'status_id') {
      json('PATCH', U.row(row.id), { status_id: cell.getValue() });
    } else {
      const key = field.replace('data.', '');
      json('PATCH', U.row(row.id), { data: { [key]: cell.getValue() } })
        .then((res) => { if (res.error) { cell.restoreOldValue(); alert(res.error); } });
    }
  });

  document.getElementById('search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    table.setFilter((rowData) => JSON.stringify(rowData).toLowerCase().includes(term));
  });

  document.getElementById('add-row').addEventListener('click', async () => {
    const row = await json('POST', U.rows);
    table.addRow(row, true);
  });

  document.getElementById('add-column').addEventListener('click', async () => {
    const label = prompt('Column label?');
    if (!label) return;
    const type = prompt('Type? text/number/date/boolean/url/select/multiselect', 'text') || 'text';
    const res = await json('POST', U.columns, { key: label, label, type });
    if (res.error) return alert(res.error);
    location.reload();
  });

  document.getElementById('upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const rows = JSON.parse(await file.text());
    const res = await json('POST', U.upload, rows);
    alert(res.error ? res.error : `Created ${res.created}, new columns: ${res.new_columns.join(', ') || 'none'}`);
    location.reload();
  });
}
init();
```

- [ ] **Step 4: Add sidebar nav.** In `base.py`, append a group to `UNFOLD["SIDEBAR"]["navigation"]`:

```python
{
    "title": _("Sales leads"),
    "items": [
        {"title": _("Leads table"), "icon": "table_view", "link": reverse_lazy("leads_page")},
        {"title": _("Lead columns"), "icon": "view_column", "link": reverse_lazy("admin:leads_leadcolumn_changelist")},
        {"title": _("Lead statuses"), "icon": "flag", "link": reverse_lazy("admin:leads_leadstatus_changelist")},
    ],
},
```

- [ ] **Step 5: Manual smoke via preview.** Start the backend, log into `/admin/`, open **Sales leads → Leads table**. Confirm the grid renders, a status cell edit persists (reload → still changed), add-row appends, upload of a small JSON array creates rows. (Verified live in the execution phase, not a unit test.)

- [ ] **Step 6: Commit.** `git add backend/apps/leads/templates backend/apps/leads/static backend/config/settings/base.py && git commit -m "feat(leads): Tabulator grid page + sidebar nav"`

---

### Task 5: Seed the Bishkek dataset

**Files:**
- Create: `backend/apps/leads/management/__init__.py`, `management/commands/__init__.py`, `management/commands/seed_leads.py`
- Create: `backend/apps/leads/fixtures/bishkek_leads.json` (generated once from the xlsx)
- Test: `backend/apps/leads/tests/test_seed.py`

**Interfaces:**
- Consumes: `services.compute_scores`, models, `import`-style creation.
- Produces: management command `seed_leads` (idempotent).

- [ ] **Step 1: Generate the fixture from the xlsx.** Run this one-off generator (writes the committed fixture; scores computed via the same formula constants as `services.compute_scores`):

```bash
cd backend && python - <<'PY'
import json, math, openpyxl
from django.utils.text import slugify  # if unavailable standalone, inline a slug fn

SRC = "/Users/abdulrahmandawoud/Downloads/jaqyn_bishkek_2gis_leads.xlsx"
wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb["All Leads"]
rows = list(ws.iter_rows(values_only=True))
headers = list(rows[0])
# Columns to keep as raw data (exclude Visit Status → becomes status; exclude the
# 6 formula score cols + Sales Priority → recomputed below).
STATUS_COL = "Visit Status"
FORMULA_COLS = {"Rating Score","Review Strength Score","Repeat Score","Young Score",
                "Local Decision Score","Campaign Ease Score","Total Jaqyn Fit Score","Sales Priority"}

def key(h): return slugify(h).replace("-", "_")

REPEAT={"High":20,"Medium":12,"Low":6}; YOUNG={"High":15,"Medium":9,"Low":4}; LOCAL={"High":15,"Medium":9,"Low":4}
TOK=("coffee","коф","cafe","каф","barber","salon","beauty","ногт","пицц","fast")
def scores(d):
    rt=float(d.get("rating") or 0); rv=float(d.get("review_count") or 0); cat=str(d.get("category") or "").lower()
    rs=min(30.0,rt*6); rss=min(10.0,math.log10(rv+1)*3.5)
    rp=REPEAT.get(d.get("repeat_visit_potential"),0); yn=YOUNG.get(d.get("young_smartphone_fit"),0)
    lo=LOCAL.get(d.get("local_decision_maker_likelihood"),0); ea=10 if any(t in cat for t in TOK) else 6
    tot=min(100,round(rs+rss+rp+yn+lo+ea)); pr="A" if tot>=80 else "B" if tot>=65 else "C"
    return {"rating_score":round(rs,1),"review_strength_score":round(rss,1),"repeat_score":rp,
            "young_score":yn,"local_decision_score":lo,"campaign_ease_score":ea,
            "total_jaqyn_fit_score":tot,"sales_priority":pr}

out=[]
for r in rows[1:]:
    rec=dict(zip(headers, r))
    if rec.get("Business Name") is None: continue
    status=rec.get(STATUS_COL) or "Not contacted"
    data={key(h):(v.isoformat() if hasattr(v,"isoformat") else v)
          for h,v in rec.items() if h not in FORMULA_COLS and h!=STATUS_COL}
    data.update(scores(data))
    out.append({"status": status, "data": data})

json.dump(out, open("apps/leads/fixtures/bishkek_leads.json","w"), ensure_ascii=False, indent=1)
print("wrote", len(out), "leads")
PY
```

Expected: `wrote 120 leads` and a populated `bishkek_leads.json`. Commit this fixture.

- [ ] **Step 2: Write failing seed test** `tests/test_seed.py`:

```python
import pytest
from django.core.management import call_command

from apps.leads.models import Lead, LeadColumn, LeadStatus

pytestmark = pytest.mark.django_db


def test_seed_is_idempotent(django_user_model):
    django_user_model.objects.create_user(username="seedbot", email="s@x.io", is_staff=True)
    call_command("seed_leads")
    first = Lead.objects.count()
    assert first == 120
    assert LeadStatus.objects.filter(is_default=True).exists()
    assert LeadColumn.objects.filter(key="total_jaqyn_fit_score", type="number").exists()
    call_command("seed_leads")  # second run must not duplicate
    assert Lead.objects.count() == first
```

- [ ] **Step 3: Run to verify fail.** `pytest apps/leads/tests/test_seed.py -v` → FAIL (no command).

- [ ] **Step 4: Implement `seed_leads.py`.** Registers the typed columns, the status pipeline, and the rows. Idempotent: skips if leads already exist.

```python
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
```

- [ ] **Step 5: Run test.** `pytest apps/leads/tests/test_seed.py -v` → PASS.

- [ ] **Step 6: Seed the running DB.** The live backend is the Docker stack (per project memory — migrate/seed via `docker exec`). Run: `docker exec jaqyn-services-web-1 python manage.py migrate leads` then `... seed_leads`. Locally: `python manage.py migrate && python manage.py seed_leads`.

- [ ] **Step 7: Commit.** `git add backend/apps/leads/management backend/apps/leads/fixtures backend/apps/leads/tests/test_seed.py && git commit -m "feat(leads): seed command + Bishkek fixture"`

---

## Self-Review

**Spec coverage:**
- Flexible JSON-backed table → Task 1 (`Lead.data`) ✓
- Runtime column registry w/ editable types → Task 1 model + Task 2 `create/update_column` + Task 4 add-column UI ✓
- JSON upload → auto-register columns → Task 2 `import_leads` + Task 3 `api_upload` + Task 4 upload UI ✓
- Runtime-managed statuses, filter by status → Task 1 `LeadStatus` + Task 4 status pill/filter ✓
- `created_by`, filter by creator → Task 1 field + Task 3 serializer + Task 4 column filter ✓
- Client-side sort/filter/search/pagination → Task 4 Tabulator ✓
- Inline edit + add row/column persisted → Task 3 PATCH/POST + Task 4 JS ✓
- Seed w/ computed scores → Task 5 ✓
- Admin section / unfold sidebar → Task 4 nav ✓
- Tests: auth + happy path + num_queries → Task 3 ✓; services → Task 2 ✓

**Placeholder scan:** none — all steps carry runnable code/commands.

**Type consistency:** service names (`coerce_value`, `import_leads`, `update_row`, `create_column`, `update_column`, `compute_scores`, `ImportResult`, `LeadServiceError`/`LeadValidationError`) and column keys used in `compute_scores`/seed match across Tasks 2 and 5. `_default_status` is referenced by both service and `api_rows` — defined once in `services.py`.

**Known deliberate shortcuts (`ponytail:`):**
- Client-side grid holds ~10k rows; switch `api_table` to server-side pagination beyond that.
- Add-column uses `prompt()` (no fancy modal) — fine for an internal tool.
- Retyping a column doesn't rewrite existing `data` blobs; stale values fail validation on next edit only.
