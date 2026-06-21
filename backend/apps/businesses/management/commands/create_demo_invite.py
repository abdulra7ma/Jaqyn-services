from django.core.management.base import BaseCommand

from apps.businesses.models import Business
from apps.businesses.onboarding_services import generate_owner_invite

FRONTEND_URL = "http://localhost:3000"


class Command(BaseCommand):
    help = "Create a draft business + owner invite for testing the onboarding flow. Prints the activation link."

    def add_arguments(self, parser):
        parser.add_argument("--name", default="Manas Coffee")
        parser.add_argument("--category", default="cafe")
        parser.add_argument("--email", default="owner@manascoffee.kg")

    def handle(self, *args, **options):
        business = Business.objects.create(
            name=options["name"],
            category=options["category"],
            onboarding_status=Business.OnboardingStatus.NOT_STARTED,
        )
        invite, raw = generate_owner_invite(business, email=options["email"])
        self.stdout.write(self.style.SUCCESS("Draft business + owner invite created."))
        self.stdout.write(f"  business_id : {business.id}")
        self.stdout.write(f"  email       : {options['email']}")
        self.stdout.write(f"  token       : {raw}")
        self.stdout.write(self.style.HTTP_INFO(f"  Activate at : {FRONTEND_URL}/business/activate?token={raw}"))
