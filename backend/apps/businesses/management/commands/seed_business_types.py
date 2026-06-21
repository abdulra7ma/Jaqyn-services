from django.core.management.base import BaseCommand

from apps.businesses.models import BusinessType

TYPES = [
    ("cafe", "Cafe", "☕", "Coffee, drinks & light bites", "menu", 10),
    ("restaurant", "Restaurant", "🍽", "Full menu, dine-in & takeaway", "menu", 20),
    ("salon", "Salon", "💇", "Hair, beauty & spa services", "services", 30),
    ("barber", "Barber", "💈", "Cuts, beard & grooming", "services", 40),
    ("retail", "Retail shop", "🛍", "Products, apparel & goods", "products", 50),
    ("gym", "Gym / Fitness", "🏋", "Memberships, classes & training", "plans", 60),
    ("clinic", "Clinic", "🩺", "Healthcare & wellness", "services", 70),
    ("carservice", "Car service", "🚗", "Maintenance, repair & detailing", "services", 80),
    ("generic", "Other / Generic", "🏪", "Flexible profile — services or products", "services", 990),
    ("other", "Not listed", "✨", "Tell us what you do", "services", 999),
]


class Command(BaseCommand):
    help = "Seed/refresh the business type catalog used by onboarding setup."

    def handle(self, *args, **options):
        for key, name, glyph, desc, module, order in TYPES:
            BusinessType.objects.update_or_create(
                key=key,
                defaults={
                    "name": name,
                    "glyph": glyph,
                    "description": desc,
                    "module": module,
                    "sort_order": order,
                    "is_active": True,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(TYPES)} business types."))
