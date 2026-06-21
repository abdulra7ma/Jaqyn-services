import uuid
from datetime import time, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import User
from apps.businesses.models import Business
from apps.groups.models import GroupDeal, GroupMember, GroupOffer


class Command(BaseCommand):
    help = "Seed an active group offer + a few group deals so 'Active groups today' has data."

    def add_arguments(self, parser):
        parser.add_argument("--business", default="", help="Business id; defaults to the most recent Manas Coffee")

    def handle(self, *args, **options):
        if options["business"]:
            business = Business.objects.get(id=options["business"])
        else:
            business = Business.objects.filter(name__icontains="Manas").order_by("-created_at").first()
        if not business:
            self.stderr.write("No business found — run create_demo_invite + activate first.")
            return

        offer, _ = GroupOffer.objects.get_or_create(
            business=business,
            title="Group of 4, everyone gets 15% off",
            defaults={
                "description": "Bring 3 friends — the whole table gets 15% off.",
                "category": "cafe",
                "min_group_size": 4,
                "max_group_size": 8,
                "reward_type": GroupOffer.RewardType.GROUP_DISCOUNT,
                "reward_description": "15% off for the group",
                "valid_days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                "time_start": time(15, 0),
                "time_end": time(18, 0),
                "max_groups_per_day": 8,
                "status": GroupOffer.Status.ACTIVE,
            },
        )

        now = timezone.now()
        specs = [
            ("Aibek K.", 16, GroupDeal.Status.COMPLETED, 4, 4),
            ("Nuraiym S.", 17, GroupDeal.Status.CHECKING_IN, 4, 2),
            ("Daniyar T.", 18, GroupDeal.Status.FORMING, 3, 0),
        ]
        created = 0
        for name, hour, status, joined, checked in specs:
            leader = self._user(name)
            deal = GroupDeal.objects.create(
                group_offer=offer,
                leader=leader,
                visit_time=now.replace(hour=min(hour, 23), minute=0, second=0, microsecond=0),
                invite_token=uuid.uuid4().hex,
                status=status,
            )
            GroupMember.objects.create(group_deal=deal, customer=leader, status=GroupMember.Status.CHECKED_IN if checked else GroupMember.Status.JOINED)
            for i in range(joined - 1):
                member = self._user(f"{name} friend {i}")
                st = GroupMember.Status.CHECKED_IN if (i + 1) < checked else GroupMember.Status.JOINED
                GroupMember.objects.create(group_deal=deal, customer=member, status=st)
            created += 1

        self.stdout.write(self.style.SUCCESS(f"Seeded offer '{offer.title}' + {created} active groups for {business.name}."))

    def _user(self, name):
        phone = f"grp-{uuid.uuid4().hex[:10]}"
        return User.objects.create(phone=phone, name=name, role=User.Role.CUSTOMER)
