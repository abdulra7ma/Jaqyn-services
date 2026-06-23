"""Named magic values for the campaigns app.

Every literal here carries a provenance comment: *why* the value is what it is
and *where* it comes from (spec section, business rule, or a mirrored convention
from a sibling app). No unexplained magic numbers/strings should appear inline in
models, services, or tasks — they live here.
"""

# Voucher code alphabet. Excludes visually ambiguous characters (0/O, 1/I, etc.)
# so a code read off a screen and typed by staff doesn't get mis-keyed.
# Source: plan §1.1 (CampaignRewardVoucher) — fixed alphabet
# `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Mirrors the loyalty redemption-code style.
VOUCHER_CODE_ALPHABET: str = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

# Length of a generated voucher code. 8 chars over a 31-symbol alphabet gives
# ~31^8 ≈ 8.5e11 combinations — ample collision headroom for a per-business code
# while staying short enough to read aloud / type. Source: plan §1.1 convention.
VOUCHER_CODE_LENGTH: int = 8

# Default window, in days, a reward voucher stays valid after it is unlocked.
# Source: plan §1.1 / D4 — "a 7-day-after-unlock expiry distinct from loyalty
# redemptions". Used only when a CampaignReward does not set its own
# `expiry_days_after_unlock`.
DEFAULT_VOUCHER_EXPIRY_DAYS: int = 7

# Default minimum gap, in minutes, between two visit actions that count toward
# the same campaign for the same customer. Guards against a single sitting being
# counted twice (anti-fraud min-interval). Source: plan §13/§15 (min-time-between
# visits) — default chosen so back-to-back scans within the hour don't double-count.
DEFAULT_MIN_MINUTES_BETWEEN_ACTIONS: int = 60

# Default required group size when a GROUP campaign does not specify one.
# Source: plan §11/§1.1 (required_group_size). Two is the smallest set that is
# still a "group"; campaigns override this explicitly.
DEFAULT_REQUIRED_GROUP_SIZE: int = 2

# Default window, in minutes, within which all group members must check in for a
# group visit to count as one coordinated session. Mirrors the existing
# `groups.GroupOffer.checkin_window_minutes` default of 30. Source: plan §1.1
# (group_checkin_window_minutes) + sibling-app convention.
DEFAULT_GROUP_CHECKIN_WINDOW_MINUTES: int = 30

# Staff-abuse detection threshold: number of visit confirmations a single staff
# member may perform within `STAFF_ABUSE_WINDOW_MINUTES` before the activity is
# flagged for review. Source: plan §15 (basic fraud — staff-abuse flag). Tuned to
# catch a staff member rapidly self-confirming visits; not a hard block in MVP.
STAFF_ABUSE_MAX_CONFIRMS: int = 30
STAFF_ABUSE_WINDOW_MINUTES: int = 60

# Lead time, in hours, before a voucher's `expires_at` at which the customer gets
# the "expiring soon" nudge. 24h gives a full day to come in and redeem before a
# (default 7-day) campaign voucher lapses. Source: plan §1.4 (notify expiring
# soon) — window chosen so the warning is actionable but not premature.
VOUCHER_EXPIRY_WARNING_HOURS: int = 24

# Lead time, in hours, before a campaign's `end_at` at which not-yet-finished
# participants get the "campaign ending" nudge. 24h mirrors the voucher window so
# a customer mid-challenge has a day's notice to make a final qualifying visit.
# Source: plan §1.4 (notify campaign ending).
CAMPAIGN_ENDING_WARNING_HOURS: int = 24
