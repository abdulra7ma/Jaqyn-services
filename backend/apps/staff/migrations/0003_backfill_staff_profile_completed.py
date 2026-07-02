from django.db import migrations


def backfill(apps, schema_editor):
    StaffMember = apps.get_model("staff", "StaffMember")
    # Existing staff are already working — mark them complete so the gate only
    # catches accounts created after this change.
    StaffMember.objects.update(profile_completed=True)


class Migration(migrations.Migration):
    dependencies = [("staff", "0002_staffmember_profile_completed")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
