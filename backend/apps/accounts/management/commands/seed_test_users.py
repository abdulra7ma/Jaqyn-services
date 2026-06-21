"""Seed a deterministic set of static test accounts (clients + a business + staff).

Every account logs in through the unified flow:
  * phone + OTP  (static dev OTP = DEV_LOGIN_OTP)
  * OR email + password  (SEED_TEST_PASSWORD)
After login the app routes by role: owner -> /business, staff -> /staff, else /.

Idempotent. Controlled by env (see config.settings.base):
  SEED_TEST_USERS, SEED_TEST_CLIENT_COUNT, SEED_TEST_PASSWORD,
  SEED_TEST_BUSINESS_CODE, DEV_LOGIN_OTP

Phones: clients +996700000001…, staff +996700000800, owner +996700000900.
"""

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.accounts.models import CustomerProfile, User
from apps.businesses.models import Business
from apps.qr.services import link_staff_user
from apps.staff.models import StaffMember

OWNER_PHONE = "+996700000900"
STAFF_PHONE = "+996700000800"


def client_phone(i: int) -> str:
    return f"+99670000{i:04d}"


def _ensure_user(phone, *, name, role, email, password):
    user, _ = User.objects.get_or_create(phone=phone, defaults={"name": name, "role": role})
    fields = []
    for attr, val in (("name", name), ("role", role), ("email", email)):
        if getattr(user, attr) != val:
            setattr(user, attr, val)
            fields.append(attr)
    if not user.is_phone_verified:
        user.is_phone_verified = True
        fields.append("is_phone_verified")
    if not user.check_password(password):
        user.set_password(password)
        fields.append("password")
    if fields:
        fields.append("updated_at")
        user.save(update_fields=fields)
    return user


class Command(BaseCommand):
    help = "Create static test clients + a business with a staff member (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--clients", type=int, default=settings.SEED_TEST_CLIENT_COUNT)

    def handle(self, *args, **options):
        count = max(1, options["clients"])
        password = settings.SEED_TEST_PASSWORD

        # Clients
        clients = []
        for i in range(1, count + 1):
            user = _ensure_user(
                client_phone(i),
                name=f"Test Client {i}",
                role=User.Role.CUSTOMER,
                email=f"client{i}@test.local",
                password=password,
            )
            CustomerProfile.objects.get_or_create(user=user)
            clients.append(user)

        # Owner + approved business with a fixed business_code
        owner = _ensure_user(
            OWNER_PHONE,
            name="Test Owner",
            role=User.Role.BUSINESS_OWNER,
            email="owner@test.local",
            password=password,
        )
        biz, _ = Business.objects.get_or_create(
            owner=owner,
            defaults=dict(
                name="Test Cafe",
                category=Business.Category.CAFE,
                address="Chuy Ave 1",
                area="Bishkek Center",
                phone=OWNER_PHONE,
                status=Business.Status.APPROVED,
                business_code=settings.SEED_TEST_BUSINESS_CODE,
            ),
        )
        biz_fields = []
        if biz.status != Business.Status.APPROVED:
            biz.status = Business.Status.APPROVED
            biz_fields.append("status")
        if biz.business_code != settings.SEED_TEST_BUSINESS_CODE:
            biz.business_code = settings.SEED_TEST_BUSINESS_CODE
            biz_fields.append("business_code")
        if biz_fields:
            biz.save(update_fields=[*biz_fields, "updated_at"])

        # Staff cashier backed by a phone/email login
        staff, _ = StaffMember.objects.get_or_create(
            business=biz,
            name="Test Cashier",
            defaults={"role": StaffMember.Role.CASHIER, "is_active": True},
        )
        if not staff.is_active:
            staff.is_active = True
            staff.save(update_fields=["is_active", "updated_at"])
        link_staff_user(
            staff, phone=STAFF_PHONE, email="staff@test.local", password=password, name="Test Cashier"
        )

        otp = settings.DEV_LOGIN_OTP or "(unset)"
        self.stdout.write(self.style.SUCCESS("Seeded static test accounts:"))
        self.stdout.write(f"  Dev OTP={otp} · password={password}")
        for u in clients:
            self.stdout.write(f"  Client : {u.phone} / {u.email}")
        self.stdout.write(f"  Owner  : {owner.phone} / {owner.email}  -> /business ({biz.name})")
        self.stdout.write(f"  Staff  : {STAFF_PHONE} / staff@test.local  -> /staff")
