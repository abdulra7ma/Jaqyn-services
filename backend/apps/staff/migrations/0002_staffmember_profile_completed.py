from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("staff", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="staffmember",
            name="profile_completed",
            field=models.BooleanField(default=False),
        ),
    ]
