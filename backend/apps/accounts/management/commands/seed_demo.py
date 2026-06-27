"""Seed a complete demo dataset for local/staging: one business owner, two staff,
three customers, plus real data across campaigns (individual / group / social).

Idempotent — safe to re-run. Existing users are reported (and their passwords are
reset to the documented value so the credentials below always work). Run with:

    python manage.py seed_demo

Every login below also accepts the dev OTP code 000000 when DEV_LOGIN_OTP=000000.
"""

from __future__ import annotations

import secrets
from datetime import time, timedelta
from decimal import Decimal
from pathlib import Path

from django.contrib.auth.hashers import make_password
from django.core.files import File
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import CustomerProfile, User
from apps.businesses.models import Business, StaffInvite
from apps.campaigns.models import (
    Campaign,
    CampaignParticipant,
    CampaignReward,
    CampaignRewardVoucher,
    CampaignRule,
    Group,
    GroupMember,
)
from apps.qr.models import QRCodeToken, ScanLog
from apps.staff.models import StaffMember

# Documented demo passwords (dev/staging only — never used in production).
OWNER_PW = "Business123!"  # explicitly requested credential
STAFF_PW = "Staff123!"
CUSTOMER_PW = "Customer123!"
STAFF_PIN = "1234"  # demo PIN stored hashed on the StaffMember

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous 0/O/1/I — matches voucher style

# Bundled real storefront photos used so the demo map/profile show real imagery
# instead of initials. Lives next to the businesses app; committed to the repo.
# __file__ = apps/accounts/management/commands/seed_demo.py → parents[3] = apps/.
SEED_ASSETS_DIR = Path(__file__).resolve().parents[3] / "businesses" / "seed_assets"
# Maps a Business.Category value to one of the four bundled photo sets. Categories
# without a dedicated set fall back to the cafe photos (the most generic storefront).
CATEGORY_ASSET = {
    "cafe": "cafe",
    "bakery": "cafe",
    "restaurant": "grill",
    "barber": "barber",
    "beauty": "salon",
    "retail": "salon",
    "other": "cafe",
}


def _code(n: int = 8) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(n))


class Command(BaseCommand):
    help = "Seed demo accounts (owner, staff, customers) and real data across all app sections."

    def handle(self, *args, **options) -> None:
        rows: list[dict] = []  # credential report

        with transaction.atomic():
            owner, staff_users, customers, biz = self._seed_accounts(rows)
            counts = {}
            counts["staff"] = self._seed_staff(biz, staff_users, customers, rows)
            counts["campaigns"] = self._seed_campaigns(biz, owner, customers)
            counts["groups"] = self._seed_groups(biz, customers)
            counts["storefronts"] = self._seed_extra_storefronts()
            counts["images"] = self._seed_images()

        self._report(rows, counts)

    # ----- accounts -------------------------------------------------------
    def _upsert_user(self, *, phone, email, password, role, name, rows, label):
        user, created = User.objects.get_or_create(phone=phone, defaults={"role": role})
        user.role = role
        user.name = name
        user.email = email
        user.is_phone_verified = True
        user.is_active = True
        user.set_password(password)  # guarantees the documented credential works
        user.save()
        rows.append({
            "role": label,
            "name": name,
            "login": f"{email}  /  {phone}",
            "password": password,
            "status": "CREATED" if created else "EXISTS (password reset)",
        })
        return user, created

    def _seed_accounts(self, rows):
        owner, _ = self._upsert_user(
            phone="+996700112233", email="owner@manas.coffee", password=OWNER_PW,
            role=User.Role.BUSINESS_OWNER, name="Nurlan A.", rows=rows, label="Business owner",
        )

        biz = Business.objects.filter(owner=owner).first()
        if biz is None:
            biz = Business(owner=owner)
        biz.name = "Manas Coffee"
        biz.category = "cafe"
        biz.area = "Chuy Avenue"
        biz.city = "Bishkek"
        # Real Bishkek coordinates (Chuy Ave, near the centre) so the nearby map
        # renders a marker; map needs lat/lng or businesses are placed on a fallback grid.
        biz.latitude = Decimal("42.876200")
        biz.longitude = Decimal("74.612400")
        biz.glyph = "☕"  # ☕
        biz.description = "Specialty coffee on Chuy Avenue, Bishkek."
        for attr, member in (("status", "APPROVED"), ("visibility_status", "PUBLISHED"),
                             ("onboarding_status", "COMPLETED"), ("verification_status", "VERIFIED")):
            enum = getattr(type(biz), {"status": "Status", "visibility_status": "VisibilityStatus",
                                       "onboarding_status": "OnboardingStatus",
                                       "verification_status": "VerificationStatus"}[attr], None)
            if enum is not None and hasattr(enum, member):
                setattr(biz, attr, getattr(enum, member))
        biz.save()

        staff_users = [
            self._upsert_user(phone="+996700112201", email="manager@manas.coffee", password=STAFF_PW,
                              role=User.Role.STAFF, name="Adina M.", rows=rows, label="Staff · Manager")[0],
            self._upsert_user(phone="+996700112202", email="cashier@manas.coffee", password=STAFF_PW,
                              role=User.Role.STAFF, name="Bektur K.", rows=rows, label="Staff · Cashier")[0],
        ]

        customers = []
        for phone, email, name in (
            ("+996700555001", "aibek@example.com", "Aibek K."),
            ("+996700555002", "aizada@example.com", "Aizada T."),
            ("+996700555003", "bek@example.com", "Bek S."),
        ):
            u, _ = self._upsert_user(phone=phone, email=email, password=CUSTOMER_PW,
                                     role=User.Role.CUSTOMER, name=name, rows=rows, label="Customer")
            prof, _ = CustomerProfile.objects.get_or_create(user=u)
            prof.onboarding_completed = True
            prof.save()
            customers.append(u)

        return owner, staff_users, customers, biz

    def _seed_staff(self, biz, staff_users, customers, rows):
        pin_hash = make_password(STAFF_PIN)
        members = {}
        for user, role, name in (
            (staff_users[0], StaffMember.Role.MANAGER, "Adina M."),
            (staff_users[1], StaffMember.Role.CASHIER, "Bektur K."),
        ):
            sm, _ = StaffMember.objects.get_or_create(business=biz, user=user, defaults={"name": name})
            sm.name = name
            sm.role = role
            sm.pin_hash = pin_hash
            sm.is_active = True
            sm.save()
            members[name] = sm

        # A SUSPENDED member (no linked user) so the Manage Staff page shows the
        # "suspended" status and the reactivate/no-login paths have demo data.
        suspended, _ = StaffMember.objects.get_or_create(
            business=biz, name="Cholpon D.", user=None,
            defaults={"role": StaffMember.Role.CASHIER},
        )
        suspended.role = StaffMember.Role.CASHIER
        suspended.pin_hash = pin_hash
        suspended.is_active = False
        suspended.save()

        # A PENDING invite so the merged team list shows an "invited" row.
        invite, _ = StaffInvite.objects.get_or_create(
            business=biz, contact="aibek.b@manas.coffee",
            defaults={"full_name": "Aibek B.", "role": StaffInvite.Role.STAFF,
                      "status": StaffInvite.Status.PENDING},
        )
        invite.full_name = "Aibek B."
        invite.role = StaffInvite.Role.STAFF
        invite.status = StaffInvite.Status.PENDING
        invite.save()

        # SUCCESS scan logs attributed to the manager + cashier so the
        # performance stats (scans / signups / last-active) render non-zero.
        # Idempotent: only seed when this business has no scan logs yet.
        scan_count = 0
        if not ScanLog.objects.filter(business=biz).exists():
            now = timezone.now()
            plan = [
                (members["Adina M."], customers[0]),
                (members["Adina M."], customers[1]),
                (members["Bektur K."], customers[1]),
                (members["Bektur K."], customers[2]),
                (members["Bektur K."], customers[0]),
            ]
            for i, (member, customer) in enumerate(plan):
                log = ScanLog.objects.create(
                    business=biz, staff=member, customer=customer,
                    action="staff_collect", status=ScanLog.Status.SUCCESS,
                )
                # created_at is auto_now_add, so backdate it explicitly to give
                # the demo a spread of "last active" times.
                ScanLog.objects.filter(pk=log.pk).update(created_at=now - timedelta(hours=i + 1))
                scan_count += 1
        return {"members": 3, "invited": 1, "suspended": 1, "scans": scan_count}

    # ----- extra demo businesses (campaigns-redesign) ---------------------
    def _upsert_business(self, *, owner_phone, owner_name, name, glyph, area, description,
                         latitude, longitude, category="cafe"):
        """Idempotently upsert an APPROVED+PUBLISHED business under its own owner.

        Backs the redesigned customer campaigns page, which needs campaigns spread
        across several businesses so the "From places you go" carousel shows
        multiple cafés. Each business gets a dedicated owner because the Business
        model enforces one business per owner (unique ``owner``); matched by owner
        so a re-run updates in place.
        """
        owner, _ = User.objects.get_or_create(
            phone=owner_phone, defaults={"role": User.Role.BUSINESS_OWNER})
        owner.role = User.Role.BUSINESS_OWNER
        owner.name = owner_name
        owner.is_phone_verified = True
        owner.is_active = True
        owner.set_password(OWNER_PW)  # documented demo credential
        owner.save()

        biz = Business.objects.filter(owner=owner).first()
        if biz is None:
            biz = Business(owner=owner, name=name)
        biz.name = name
        biz.category = category
        biz.area = area
        biz.city = "Bishkek"
        # Real Bishkek coordinates so the nearby map plots each storefront.
        biz.latitude = latitude
        biz.longitude = longitude
        biz.glyph = glyph
        biz.description = description
        for attr, member in (("status", "APPROVED"), ("visibility_status", "PUBLISHED"),
                             ("onboarding_status", "COMPLETED"), ("verification_status", "VERIFIED")):
            enum = getattr(type(biz), {"status": "Status", "visibility_status": "VisibilityStatus",
                                       "onboarding_status": "OnboardingStatus",
                                       "verification_status": "VerificationStatus"}[attr], None)
            if enum is not None and hasattr(enum, member):
                setattr(biz, attr, getattr(enum, member))
        biz.save()
        return biz

    # ----- extra storefronts + imagery ------------------------------------
    def _seed_extra_storefronts(self) -> int:
        """Three more real, varied storefronts (barber/beauty/restaurant) so the
        nearby map and public profiles show category variety with real photos —
        mirroring the four brands on the marketing landing. No campaigns attached;
        they exist purely to populate discovery. Idempotent (matched by owner)."""
        specs = [
            dict(owner_phone="+996700112266", owner_name="Aibek T.", name="Aibek Barber",
                 glyph="💈", area="Sovetskaya Street", category="barber",
                 description="Classic cuts and hot-towel shaves on Sovetskaya, Bishkek.",
                 latitude=Decimal("42.871500"), longitude=Decimal("74.598200")),
            dict(owner_phone="+996700112277", owner_name="Aizada N.", name="Lush Salon",
                 glyph="💅", area="Toktogul Street", category="beauty",
                 description="Hair, nails and beauty treatments on Toktogul, Bishkek.",
                 latitude=Decimal("42.879100"), longitude=Decimal("74.608700")),
            dict(owner_phone="+996700112288", owner_name="Tanyrbek K.", name="Tanyr Grill",
                 glyph="🍖", area="Jibek Jolu Avenue", category="restaurant",
                 description="Charcoal-grilled kebabs and ribs on Jibek Jolu, Bishkek.",
                 latitude=Decimal("42.883400"), longitude=Decimal("74.605900")),
        ]
        for spec in specs:
            self._upsert_business(**spec)
        return len(specs)

    def _attach_images(self, biz) -> bool:
        """Attach a bundled real logo + cover to a business that lacks them, chosen
        by category. Returns True if anything was attached. Idempotent: skips a
        field that is already set so re-runs don't churn storage."""
        prefix = CATEGORY_ASSET.get(biz.category or "", "cafe")
        changed = False
        if not biz.logo:
            with open(SEED_ASSETS_DIR / f"{prefix}_logo.jpg", "rb") as fh:
                biz.logo.save(f"seed_{biz.id}_logo.jpg", File(fh), save=False)
            biz.logo_set = True  # server-managed "has real logo" flag
            changed = True
        if not biz.cover_image:
            with open(SEED_ASSETS_DIR / f"{prefix}_cover.jpg", "rb") as fh:
                biz.cover_image.save(f"seed_{biz.id}_cover.jpg", File(fh), save=False)
            biz.cover_set = True
            changed = True
        if changed:
            biz.save()
        return changed

    def _seed_images(self) -> int:
        """Give every seeded business real photos so discovery is never initials."""
        return sum(int(self._attach_images(biz)) for biz in Business.objects.all())

    # ----- campaigns ------------------------------------------------------
    def _seed_campaigns(self, biz, owner, customers):
        now = timezone.now()
        RT = CampaignReward.ReceiverType

        # Two more storefronts owned by the same demo owner so campaigns span
        # multiple businesses (redesigned customer page). Idempotent upsert.
        bublik = self._upsert_business(
            owner_phone="+996700112244", owner_name="Gulnara S.",
            name="Bublik Bistro", glyph="🥪", area="Erkindik Boulevard",
            description="Fresh bagels and lunch sandwiches on Erkindik, Bishkek.",
            latitude=Decimal("42.873000"), longitude=Decimal("74.601000"))
        luna = self._upsert_business(
            owner_phone="+996700112255", owner_name="Cholpon B.",
            name="Cafe Luna", glyph="🍰", area="Ala-Too Square",
            description="Desserts and weekend hangouts by Ala-Too Square, Bishkek.",
            latitude=Decimal("42.876900"), longitude=Decimal("74.603600"))

        def mk(business, name, desc, ctype, *, mechanic=None, required=1, status=Campaign.Status.ACTIVE,
               group_size=None, required_spend=None, instagram_handle=None,
               reward_title="", reward_desc="", max_rewards=200):
            c, _ = Campaign.objects.get_or_create(business=business, name=name, defaults=dict(
                created_by=owner, description=desc, campaign_type=ctype,
                status=status, start_at=now - timedelta(days=2),
                end_at=now + timedelta(days=5), active_days=[], max_participants=1000,
                max_rewards=max_rewards, completion_limit_per_customer=Campaign.CompletionLimit.ONCE,
                auto_join_enabled=True, allow_multiple_campaign_counting=False,
                instagram_handle=instagram_handle))
            rule_type = (
                CampaignRule.RuleType.GROUP_CHECKIN if ctype == Campaign.CampaignType.GROUP
                else CampaignRule.RuleType.VISIT_COUNT
            )
            CampaignRule.objects.get_or_create(campaign=c, defaults=dict(
                rule_type=rule_type, mechanic=mechanic, required_count=required,
                required_spend=required_spend,
                minimum_time_between_actions=timedelta(hours=1), max_count_per_day=1,
                required_group_size=group_size,
                group_checkin_window_minutes=(15 if group_size else None)))
            CampaignReward.objects.get_or_create(campaign=c, defaults=dict(
                reward_type=CampaignReward.RewardType.FREE_ITEM, title=reward_title,
                description=reward_desc, estimated_cost=Decimal("90.00"), expiry_days_after_unlock=7,
                max_redemptions=max_rewards, reward_receiver_type=RT.LEADER))
            return c

        # Spread across all three businesses and all three types. Per the
        # campaigns-restructure plan §7 the demo emits one ACTIVE Social, one DRAFT
        # Group, and one COMPLETED Individual so the Status filter has rows.
        c1 = mk(biz, "Morning Coffee Challenge",
                "Visit 3 times this week and get a free croissant.",
                Campaign.CampaignType.INDIVIDUAL, mechanic=CampaignRule.Mechanic.VISIT, required=3,
                reward_title="Free croissant", reward_desc="Any croissant up to 150 KGS")
        c2 = mk(bublik, "Lunch Loyalty Streak", "Collect 5 stamps this month and get 20% off your order.",
                Campaign.CampaignType.INDIVIDUAL, mechanic=CampaignRule.Mechanic.STAMP, required=5,
                reward_title="20% off your order", reward_desc="Up to 400 KGS off", max_rewards=500)
        # ACTIVE Social campaign (Instagram follow/tag → bonus).
        mk(luna, "Tag Us for a Treat", "Follow and tag us on Instagram for a free dessert.",
           Campaign.CampaignType.SOCIAL, instagram_handle="@cafe.luna",
           reward_title="Free dessert", reward_desc="One shared dessert", max_rewards=120)
        # DRAFT Group campaign (bring friends).
        mk(luna, "Weekend Friends Deal", "Come with 3 friends and unlock a free dessert for the table.",
           Campaign.CampaignType.GROUP, status=Campaign.Status.DRAFT, group_size=4,
           reward_title="Free dessert for the table", reward_desc="One shared dessert", max_rewards=120)
        # A stamp (loyalty) card at Manas → seeded as COMPLETED below.
        c4 = mk(biz, "Coffee Lovers Punch Card", "Buy 4 coffees this week and the 5th is free.",
                Campaign.CampaignType.INDIVIDUAL, mechanic=CampaignRule.Mechanic.STAMP, required=4,
                reward_title="Free coffee", reward_desc="Any drink up to 200 KGS", max_rewards=300)

        # Participants. Aibek (customers[0]) is JOINED + in-progress across two
        # different businesses so "From places you go" shows multiple cafés:
        # Morning Coffee 2/3 at Manas, Lunch 3/5 at Bublik. The other customers'
        # data is preserved (Aizada mid Morning + Lunch, Bek mid Lunch).
        def join(camp, cust, progress, status):
            p, _ = CampaignParticipant.objects.get_or_create(campaign=camp, customer=cust, defaults=dict(
                status=status, progress_count=progress, joined_at=now - timedelta(days=1),
                last_progress_at=now - timedelta(hours=3)))
            p.status = status
            p.progress_count = progress
            if status == CampaignParticipant.Status.COMPLETED:
                p.completed_at = now
            p.save()
            return p

        S = CampaignParticipant.Status
        join(c1, customers[0], 2, S.IN_PROGRESS)  # Aibek: Morning Coffee 2/3 @ Manas
        join(c2, customers[0], 3, S.IN_PROGRESS)  # Aibek: Lunch 3/5 @ Bublik
        join(c1, customers[1], 2, S.IN_PROGRESS)  # Aizada: Morning Coffee @ Manas
        join(c2, customers[1], 3, S.IN_PROGRESS)  # Aizada: Lunch @ Bublik
        join(c2, customers[2], 1, S.IN_PROGRESS)  # Bek: Lunch @ Bublik
        # Aizada completed the Manas punch card → an ACTIVE reward voucher to
        # present, so the wallet/present flow has live demo data.
        join(c4, customers[1], 4, S.COMPLETED)

        vouchers = 0
        reward = CampaignReward.objects.filter(campaign=c4).first()
        if reward and not CampaignRewardVoucher.objects.filter(
            campaign=c4, customer=customers[1]
        ).exists():
            token = QRCodeToken.objects.create(
                token=secrets.token_urlsafe(16), type=QRCodeToken.Type.CAMPAIGN_REWARD,
                business=biz, customer=customers[1], campaign=c4.id,
                is_active=True, expires_at=now + timedelta(days=7))
            CampaignRewardVoucher.objects.create(
                campaign=c4, customer=customers[1], business=biz, reward=reward,
                voucher_code=_code(), qr_token=token, status=CampaignRewardVoucher.Status.ACTIVE,
                issued_at=now, expires_at=now + timedelta(days=7))
            vouchers = 1

        return {"campaigns": 5, "businesses": 3, "participants": 6, "active_voucher": vouchers}

    # ----- group runtime --------------------------------------------------
    def _seed_groups(self, biz, customers):
        """Seed one forming Group inside an ACTIVE GROUP campaign at ``biz``.

        Post-restructure a group lives inside a GROUP campaign (no separate group
        offer). Creates an ACTIVE group campaign and a FORMING Group with members.
        """
        now = timezone.now()
        campaign, _ = Campaign.objects.get_or_create(
            business=biz, name="Bring 3 Friends", defaults=dict(
                description="Come as a group of 4 and unlock a free dessert for the table.",
                campaign_type=Campaign.CampaignType.GROUP, status=Campaign.Status.ACTIVE,
                max_rewards=120, completion_limit_per_customer=Campaign.CompletionLimit.ONCE))
        campaign.status = Campaign.Status.ACTIVE
        campaign.save(update_fields=["status", "updated_at"])
        CampaignRule.objects.get_or_create(campaign=campaign, defaults=dict(
            rule_type=CampaignRule.RuleType.GROUP_CHECKIN, required_group_size=4,
            group_checkin_window_minutes=15))
        CampaignReward.objects.get_or_create(campaign=campaign, defaults=dict(
            reward_type=CampaignReward.RewardType.FREE_ITEM, title="Free dessert for the table",
            description="One shared dessert", reward_receiver_type=CampaignReward.ReceiverType.LEADER))

        group, created = Group.objects.get_or_create(
            campaign=campaign, group_leader=customers[0], defaults=dict(
                required_size=4, invite_token=secrets.token_urlsafe(12),
                expires_at=now + timedelta(days=1), status=Group.Status.FORMING))
        if created:
            for cust in customers:  # leader + 2 others joined, 1 slot open
                GroupMember.objects.get_or_create(group=group, customer=cust,
                                                  defaults={"status": GroupMember.Status.JOINED, "joined_at": now})
        return {"offer": campaign.name, "deals": 1, "members": group.members.count()}

    # ----- report ---------------------------------------------------------
    def _report(self, rows, counts):
        w = self.stdout.write
        w("")
        w(self.style.MIGRATE_HEADING("=== Demo accounts ==="))
        w(f"{'ROLE':<18}{'NAME':<12}{'LOGIN (email / phone)':<40}{'PASSWORD':<14}STATUS")
        w("-" * 100)
        for r in rows:
            w(f"{r['role']:<18}{r['name']:<12}{r['login']:<40}{r['password']:<14}{r['status']}")
        w("")
        w("All logins also accept dev OTP code 000000 (when DEV_LOGIN_OTP=000000). Staff PIN: " + STAFF_PIN)
        w("")
        w(self.style.MIGRATE_HEADING("=== Seeded data ==="))
        w(f"Staff     : {counts['staff']['members']} members "
          f"({counts['staff']['suspended']} suspended), "
          f"{counts['staff']['invited']} pending invite(s), "
          f"{counts['staff']['scans']} scan log(s)")
        w(f"Campaigns : {counts['campaigns']['campaigns']} campaigns across "
          f"{counts['campaigns']['businesses']} businesses "
          f"(Manas Coffee, Bublik Bistro, Cafe Luna), "
          f"{counts['campaigns']['participants']} participants, "
          f"{counts['campaigns']['active_voucher']} active reward voucher(s)")
        w(f"Groups    : offer '{counts['groups']['offer']}', "
          f"{counts['groups']['deals']} active deal, {counts['groups']['members']} members")
        w("")
        w(self.style.SUCCESS("Demo seed complete."))
