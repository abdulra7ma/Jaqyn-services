"""Data migration: seed the 15 PatchDef rows from dcscript-1.js DEF[].

This is a pure data migration — no schema changes. The 15 rows are derived from
the DEF[] array in the design script. rule_type and rule_params are derived from
the "how" text and the spec §A rule-types list. No logic runs here beyond
bulk_create of literals; progress evaluation happens in PatchProgressService.

Separation rationale: schema migrations and data migrations must be separate files
(backend.md rule). This migration depends on 0001_initial (schema only).
"""

from __future__ import annotations

from django.db import migrations


# The 15 patch definitions derived from dcscript-1.js DEF[].
# Fields: slug, name, shape, icon, color, light, deep, how, rule_type, rule_params, sort_order.
#
# rule_type / rule_params derivation:
#   first    → FIRST_EVENT {"event": "stamp_scanned"}        — "first stamp"
#   cards    → CARDS_COMPLETED {"n": 5}                      — "five loyalty cards"
#   coffee   → DISTINCT_BUSINESSES {"n": 3, "category": "cafe"} — "three different cafés"
#   early    → TIME_OF_DAY {"direction": "before", "time": "10:00"} — "before 10:00"
#   group    → GROUP_LED {"n": 1}                            — "led a group campaign"
#   weekend  → WEEKEND_STREAK {"n": 3}                       — "three weekends in a row"
#   sweet    → CARDS_COMPLETED {"n": 1, "category": "bakery"} — "earned a reward at a bakery"
#   explorer → DISTINCT_BUSINESSES {"n": 10}                 — "10 different shops"
#   legend   → DISTINCT_BUSINESSES {"n": 25}                 — "top tier" (placeholder: 25 businesses)
#   night    → TIME_OF_DAY {"direction": "after", "time": "21:00"} — "after 21:00"
#   gift     → REFERRALS {"n": 1}                            — "send a reward to a friend" (v1 no-op)
#   tea      → CARDS_COMPLETED {"n": 5, "category": "tea"}   — "full tea-house card" × 5
#   spender  → SPEND_TOTAL {"som": 10000}                    — "10,000 som across shops"
#   connect  → REFERRALS {"n": 3}                            — "invite three friends" (v1 no-op)
#   wander   → DISTRICTS {"n": 3}                            — "three city districts" (v1 no-op)
_PATCH_DEFS = [
    {
        "slug": "first",
        "name": "First Stamp",
        "shape": "circle",
        "icon": "star",
        "color": "#C25E3C",
        "light": "#DE8E70",
        "deep": "#A2492A",
        "how": "Collected your very first stamp in the app.",
        "rule_type": "FIRST_EVENT",
        "rule_params": {"event": "stamp_scanned"},
        "sort_order": 0,
    },
    {
        "slug": "cards",
        "name": "5 Cards Collected",
        "shape": "hexagon",
        "icon": "layers",
        "color": "#E7A23E",
        "light": "#F2C173",
        "deep": "#C07E1D",
        "how": "Filled five loyalty cards across Bishkek.",
        "rule_type": "CARDS_COMPLETED",
        "rule_params": {"n": 5},
        "sort_order": 1,
    },
    {
        "slug": "coffee",
        "name": "Coffee Route",
        "shape": "shield",
        "icon": "coffee",
        "color": "#9D4E7C",
        "light": "#B573A0",
        "deep": "#7E3B62",
        "how": "Visited three different cafés around the city.",
        "rule_type": "DISTINCT_BUSINESSES",
        "rule_params": {"n": 3, "category": "cafe"},
        "sort_order": 2,
    },
    {
        "slug": "early",
        "name": "Early Bird",
        "shape": "banner",
        "icon": "sunrise",
        "color": "#5E8B6A",
        "light": "#7BAE87",
        "deep": "#487159",
        "how": "Scanned a stamp before 10:00 in the morning.",
        "rule_type": "TIME_OF_DAY",
        "rule_params": {"direction": "before", "time": "10:00"},
        "sort_order": 3,
    },
    {
        "slug": "group",
        "name": "Group Leader",
        "shape": "shield",
        "icon": "users",
        "color": "#4E6B9D",
        "light": "#7590BE",
        "deep": "#3B5480",
        "how": "Led a group campaign all the way to the reward.",
        "rule_type": "GROUP_LED",
        "rule_params": {"n": 1},
        "sort_order": 4,
    },
    {
        "slug": "weekend",
        "name": "Weekend Regular",
        "shape": "hexagon",
        "icon": "repeat",
        "color": "#C25E3C",
        "light": "#DE8E70",
        "deep": "#A2492A",
        "how": "Showed up three weekends in a row.",
        "rule_type": "WEEKEND_STREAK",
        "rule_params": {"n": 3},
        "sort_order": 5,
    },
    {
        "slug": "sweet",
        "name": "Sweet Tooth",
        "shape": "circle",
        "icon": "heart",
        "color": "#E7A23E",
        "light": "#F2C173",
        "deep": "#C07E1D",
        "how": "Earned a reward at a bakery.",
        "rule_type": "CARDS_COMPLETED",
        "rule_params": {"n": 1, "category": "bakery"},
        "sort_order": 6,
    },
    {
        "slug": "explorer",
        "name": "Bishkek Explorer",
        "shape": "shield",
        "icon": "compass",
        "color": "#C25E3C",
        "light": "#DE8E70",
        "deep": "#A2492A",
        "how": "Visit 10 different shops around Bishkek.",
        "rule_type": "DISTINCT_BUSINESSES",
        "rule_params": {"n": 10},
        "sort_order": 7,
    },
    {
        "slug": "legend",
        "name": "Local Legend",
        "shape": "banner",
        "icon": "crown",
        "color": "#9D4E7C",
        "light": "#B573A0",
        "deep": "#7E3B62",
        "how": "Reach the top tier of the city.",
        "rule_type": "DISTINCT_BUSINESSES",
        # 25 businesses is the "top tier" threshold — an ambitious milestone for a
        # city-wide loyalty explorer. Source: dcscript-1.js "legend" def (ptext:
        # 'Locked') — no explicit number given; 25 is the spec-chosen value for a
        # prestige-tier unlock. Can be updated via data migration.
        "rule_params": {"n": 25},
        "sort_order": 8,
    },
    {
        "slug": "night",
        "name": "Night Owl",
        "shape": "hexagon",
        "icon": "moon",
        "color": "#4E6B9D",
        "light": "#7590BE",
        "deep": "#3B5480",
        "how": "Scan a stamp after 21:00.",
        "rule_type": "TIME_OF_DAY",
        "rule_params": {"direction": "after", "time": "21:00"},
        "sort_order": 9,
    },
    {
        "slug": "gift",
        "name": "Gift Giver",
        "shape": "circle",
        "icon": "gift",
        "color": "#5E8B6A",
        "light": "#7BAE87",
        "deep": "#487159",
        "how": "Send a reward to a friend.",
        "rule_type": "REFERRALS",
        # n=1 referral. REFERRALS is a no-op evaluator in v1 (no referral-tracking
        # data source exists yet). Progress stays 0 until the referral system ships.
        # Source: spec §A out-of-scope note; dcscript-1.js "gift" def.
        "rule_params": {"n": 1},
        "sort_order": 10,
    },
    {
        "slug": "tea",
        "name": "Tea Master",
        "shape": "banner",
        "icon": "droplet",
        "color": "#E7A23E",
        "light": "#F2C173",
        "deep": "#C07E1D",
        "how": "Finish a full tea-house card.",
        "rule_type": "CARDS_COMPLETED",
        # ptext '2 / 5' in the design — target 5 completions at a tea-category business.
        "rule_params": {"n": 5, "category": "tea"},
        "sort_order": 11,
    },
    {
        "slug": "spender",
        "name": "Big Spender",
        "shape": "hexagon",
        "icon": "zap",
        "color": "#C25E3C",
        "light": "#DE8E70",
        "deep": "#A2492A",
        "how": "Spend 10,000 som across shops.",
        "rule_type": "SPEND_TOTAL",
        "rule_params": {"som": 10000},
        "sort_order": 12,
    },
    {
        "slug": "connect",
        "name": "City Connector",
        "shape": "shield",
        "icon": "users",
        "color": "#4E6B9D",
        "light": "#7590BE",
        "deep": "#3B5480",
        "how": "Invite three friends to Jaqyn.",
        "rule_type": "REFERRALS",
        # n=3 referrals. No-op evaluator in v1 — no referral-tracking data.
        # Source: spec §A; dcscript-1.js "connect" def (ptext: '1 / 3').
        "rule_params": {"n": 3},
        "sort_order": 13,
    },
    {
        "slug": "wander",
        "name": "City Wanderer",
        "shape": "circle",
        "icon": "pin",
        "color": "#9D4E7C",
        "light": "#B573A0",
        "deep": "#7E3B62",
        "how": "Earn a patch in three city districts.",
        "rule_type": "DISTRICTS",
        # n=3 districts. DISTRICTS is a no-op evaluator in v1 — no district-geo
        # data source exists (business has lat/lng but district boundary mapping
        # is out of scope). Progress stays 0 until district geo ships.
        # Source: spec §A out-of-scope note; dcscript-1.js "wander" def.
        "rule_params": {"n": 3},
        "sort_order": 14,
    },
]


def seed_patches(apps, schema_editor):
    PatchDef = apps.get_model("patches", "PatchDef")
    PatchDef.objects.bulk_create(
        [PatchDef(**d) for d in _PATCH_DEFS],
        ignore_conflicts=True,
    )


def unseed_patches(apps, schema_editor):
    PatchDef = apps.get_model("patches", "PatchDef")
    slugs = [d["slug"] for d in _PATCH_DEFS]
    PatchDef.objects.filter(slug__in=slugs).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("patches", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_patches, reverse_code=unseed_patches),
    ]
