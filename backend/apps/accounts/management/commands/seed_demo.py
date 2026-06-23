"""Seed a complete demo dataset for local/staging: one business owner, two staff,
three customers, plus real data across loyalty, campaigns and group deals.

Idempotent — safe to re-run. Existing users are reported (and their passwords are
reset to the documented value so the credentials below always work). Run with:

    python manage.py seed_demo

Every login below also accepts the dev OTP code 000000 when DEV_LOGIN_OTP=000000.
"""

from __future__ import annotations

import secrets
from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
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
)
from apps.groups.models import GroupDeal, GroupMember, GroupOffer
from apps.loyalty.models import CustomerRewardProgress, RewardProgram, RewardRedemption
from apps.qr.models import QRCodeToken, ScanLog
from apps.staff.models import StaffMember

# Documented demo passwords (dev/staging only — never used in production).
OWNER_PW = "Business123!"  # explicitly requested credential
STAFF_PW = "Staff123!"
CUSTOMER_PW = "Customer123!"
STAFF_PIN = "1234"  # demo PIN stored hashed on the StaffMember

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous 0/O/1/I — matches voucher style


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
            counts["loyalty"] = self._seed_loyalty(biz, customers)
            counts["campaigns"] = self._seed_campaigns(biz, owner, customers)
            counts["groups"] = self._seed_groups(biz, customers)

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

    # ----- loyalty --------------------------------------------------------
    def _seed_loyalty(self, biz, customers):
        program, _ = RewardProgram.objects.get_or_create(
            business=biz, title="Coffee Club", defaults=dict(
                type=RewardProgram.Type.STAMP,
                description="Collect 6 stamps, the 7th coffee is on us.",
                required_count=6, reward_description="Free coffee", expiry_days=30,
                terms="One stamp per visit.", is_active=True))
        program.is_active = True
        program.save()

        # Customer 0: fully stamped + unlocked, with a pending voucher to redeem.
        # Customer 1: mid-progress. Customer 2: just started.
        plan = [(customers[0], 6, CustomerRewardProgress.Status.UNLOCKED),
                (customers[1], 3, CustomerRewardProgress.Status.ACTIVE),
                (customers[2], 1, CustomerRewardProgress.Status.ACTIVE)]
        vouchers = 0
        for cust, count, status in plan:
            prog, _ = CustomerRewardProgress.objects.get_or_create(
                customer=cust, business=biz, reward_program=program,
                defaults=dict(current_count=count, target_count=6, status=status))
            prog.current_count = count
            prog.target_count = 6
            prog.status = status
            if status == CustomerRewardProgress.Status.UNLOCKED:
                prog.unlocked_at = timezone.now()
            prog.save()
            if status == CustomerRewardProgress.Status.UNLOCKED:
                _, created = RewardRedemption.objects.get_or_create(
                    customer=cust, business=biz, reward_program=program, progress=prog,
                    status=RewardRedemption.Status.PENDING,
                    defaults=dict(code=_code(), expires_at=timezone.now() + timedelta(days=30)))
                vouchers += int(created)
        return {"program": program.title, "progress_rows": len(plan), "pending_vouchers": vouchers}

    # ----- extra demo businesses (campaigns-redesign) ---------------------
    def _upsert_business(self, *, owner_phone, owner_name, name, glyph, area, description):
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
        biz.category = "cafe"
        biz.area = area
        biz.city = "Bishkek"
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

    # ----- campaigns ------------------------------------------------------
    def _seed_campaigns(self, biz, owner, customers):
        now = timezone.now()
        RT = CampaignReward.ReceiverType

        # Two more storefronts owned by the same demo owner so campaigns span
        # multiple businesses (redesigned customer page). Idempotent upsert.
        bublik = self._upsert_business(
            owner_phone="+996700112244", owner_name="Gulnara S.",
            name="Bublik Bistro", glyph="🥪", area="Erkindik Boulevard",
            description="Fresh bagels and lunch sandwiches on Erkindik, Bishkek.")
        luna = self._upsert_business(
            owner_phone="+996700112255", owner_name="Cholpon B.",
            name="Cafe Luna", glyph="🍰", area="Ala-Too Square",
            description="Desserts and weekend hangouts by Ala-Too Square, Bishkek.")

        def mk(business, name, desc, ctype, rule_type, required, *, window=None, group_size=None,
               reward_title="", reward_desc="", max_rewards=200):
            c, _ = Campaign.objects.get_or_create(business=business, name=name, defaults=dict(
                created_by=owner, description=desc, campaign_type=ctype,
                status=Campaign.Status.ACTIVE, start_at=now - timedelta(days=2),
                end_at=now + timedelta(days=5), active_days=[], max_participants=1000,
                max_rewards=max_rewards, completion_limit_per_customer=Campaign.CompletionLimit.ONCE,
                auto_join_enabled=True, allow_multiple_campaign_counting=False))
            CampaignRule.objects.get_or_create(campaign=c, defaults=dict(
                rule_type=rule_type, required_count=required,
                minimum_time_between_actions=timedelta(hours=1), max_count_per_day=1,
                required_group_size=group_size,
                group_checkin_window_minutes=(15 if group_size else None), window_before_time=window))
            CampaignReward.objects.get_or_create(campaign=c, defaults=dict(
                reward_type=CampaignReward.RewardType.FREE_ITEM, title=reward_title,
                description=reward_desc, estimated_cost=Decimal("90.00"), expiry_days_after_unlock=7,
                max_redemptions=max_rewards, reward_receiver_type=RT.LEADER))
            return c

        # Spread across all three businesses and all three types so every filter
        # chip on the redesigned page (visit / time_window / group) returns rows.
        c1 = mk(biz, "Morning Coffee Challenge",
                "Visit 3 times before 12:00 this week and get a free croissant.",
                Campaign.CampaignType.TIME_WINDOW, CampaignRule.RuleType.TIME_WINDOW, 3, window=time(12, 0),
                reward_title="Free croissant", reward_desc="Any croissant up to 150 KGS")
        c2 = mk(bublik, "Lunch Loyalty Streak", "Visit 5 times this month and get 20% off your order.",
                Campaign.CampaignType.VISIT, CampaignRule.RuleType.VISIT_COUNT, 5,
                reward_title="20% off your order", reward_desc="Up to 400 KGS off", max_rewards=500)
        mk(luna, "Weekend Friends Deal", "Come with 3 friends and unlock a free dessert for the table.",
           Campaign.CampaignType.GROUP, CampaignRule.RuleType.GROUP_CHECKIN, 1, group_size=4,
           reward_title="Free dessert for the table", reward_desc="One shared dessert", max_rewards=120)
        # A plain visit campaign at Manas so the home business also has a visit type.
        c4 = mk(biz, "Coffee Lovers Punch Card", "Buy 4 coffees this week and the 5th is free.",
                Campaign.CampaignType.VISIT, CampaignRule.RuleType.VISIT_COUNT, 4,
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

        return {"campaigns": 4, "businesses": 3, "participants": 6, "active_voucher": vouchers}

    # ----- group deals ----------------------------------------------------
    def _seed_groups(self, biz, customers):
        now = timezone.now()
        today = timezone.localdate()
        offer, _ = GroupOffer.objects.get_or_create(
            business=biz, title="Bring 3 Friends", defaults=dict(
                description="Come as a group of 4 and unlock a free dessert for the table.",
                category="cafe", min_group_size=4, max_group_size=6,
                reward_type=GroupOffer.RewardType.FREE_SHARED_ITEM,
                reward_description="Free dessert for the table",
                valid_from=today, valid_to=today + timedelta(days=30), valid_days=[],
                time_start=time(14, 0), time_end=time(20, 0), checkin_window_minutes=15,
                status=GroupOffer.Status.ACTIVE))
        offer.status = GroupOffer.Status.ACTIVE
        offer.save()

        deal, created = GroupDeal.objects.get_or_create(
            group_offer=offer, leader=customers[0], defaults=dict(
                visit_time=now + timedelta(days=1), invite_token=secrets.token_urlsafe(12),
                status=GroupDeal.Status.FORMING))
        if created:
            for cust in customers:  # leader + 2 others joined, 1 slot open
                GroupMember.objects.get_or_create(group_deal=deal, customer=cust,
                                                   defaults={"status": GroupMember.Status.JOINED})
        return {"offer": offer.title, "deals": 1, "members": deal.members.count()}

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
        w(f"Loyalty   : program '{counts['loyalty']['program']}', "
          f"{counts['loyalty']['progress_rows']} progress rows, "
          f"{counts['loyalty']['pending_vouchers']} pending voucher(s)")
        w(f"Campaigns : {counts['campaigns']['campaigns']} campaigns across "
          f"{counts['campaigns']['businesses']} businesses "
          f"(Manas Coffee, Bublik Bistro, Cafe Luna), "
          f"{counts['campaigns']['participants']} participants, "
          f"{counts['campaigns']['active_voucher']} active reward voucher(s)")
        w(f"Groups    : offer '{counts['groups']['offer']}', "
          f"{counts['groups']['deals']} active deal, {counts['groups']['members']} members")
        w("")
        w(self.style.SUCCESS("Demo seed complete."))
