"""Test helpers for the patches app."""

from __future__ import annotations

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.patches.models import PatchDef


def make_customer(suffix: str = "001") -> User:
    return User.objects.create_user(
        phone=f"+99670900{suffix}",
        role=User.Role.CUSTOMER,
        is_phone_verified=True,
        name=f"Patcher {suffix}",
    )


def make_patch_def(
    *,
    slug: str = "test-patch",
    name: str = "Test Patch",
    shape: str = "circle",
    icon: str = "star",
    color: str = "#C25E3C",
    light: str = "#DE8E70",
    deep: str = "#A2492A",
    how: str = "Do something.",
    rule_type: str = PatchDef.RuleType.FIRST_EVENT,
    rule_params: dict | None = None,
    sort_order: int = 0,
    is_active: bool = True,
) -> PatchDef:
    return PatchDef.objects.create(
        slug=slug,
        name=name,
        shape=shape,
        icon=icon,
        color=color,
        light=light,
        deep=deep,
        how=how,
        rule_type=rule_type,
        rule_params=rule_params or {"event": "stamp_scanned"},
        sort_order=sort_order,
        is_active=is_active,
    )


def make_business(suffix: str = "001") -> Business:
    owner = User.objects.create_user(
        phone=f"+99671000{suffix}",
        role=User.Role.BUSINESS_OWNER,
        is_phone_verified=True,
    )
    return Business.objects.create(
        owner=owner,
        name=f"Test Business {suffix}",
        category="cafe",
        address="Test St 1",
        area="center",
        phone=f"+99671010{suffix}",
        working_hours={},
        status=Business.Status.APPROVED,
    )
