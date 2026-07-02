"""Staff services package — public surface.

Split by responsibility (backend rules: split by responsibility, re-export the
public surface here):

* :mod:`.management` — owner-facing Manage Staff (``/api/business/staff/``).
* :mod:`.activity` — staff-till today-stats and unified activity feed
  (``/api/staff/stats/`` + ``/api/staff/recent-activity/``).
"""

from apps.staff.services.activity import (
    ACTIVITY_KINDS,
    ActivityEvent,
    StaffTodayStats,
    get_staff_today_stats,
    list_activity_events,
)
from apps.staff.services.management import (
    StaffStats,
    TeamCounts,
    TeamList,
    TeamRow,
    change_role,
    complete_staff_profile,
    create_staff_account,
    get_staff_detail,
    get_staff_for_user,
    get_staff_member,
    list_team,
    remove_staff_member,
    reset_staff_password,
    set_active,
)

__all__ = [
    "ACTIVITY_KINDS",
    "ActivityEvent",
    "StaffStats",
    "StaffTodayStats",
    "TeamCounts",
    "TeamList",
    "TeamRow",
    "change_role",
    "complete_staff_profile",
    "create_staff_account",
    "get_staff_detail",
    "get_staff_for_user",
    "get_staff_member",
    "get_staff_today_stats",
    "list_activity_events",
    "list_team",
    "remove_staff_member",
    "reset_staff_password",
    "set_active",
]
