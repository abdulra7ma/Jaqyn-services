"""Admin-internal JSON endpoints for the leads grid. Session-authenticated,
CSRF-protected, staff-only. Views parse → call a service → return JsonResponse."""

import json

from django.contrib.admin.views.decorators import staff_member_required
from django.http import HttpRequest, JsonResponse
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
