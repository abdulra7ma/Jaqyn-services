from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
        ("campaigns", "0004_remove_campaignparticipant_current_spend_and_more"),
        ("notifications", "0002_notificationpreference_campaign_updates"),
    ]

    operations = [
        migrations.CreateModel(
            name="CampaignNotice",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("seen_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "campaign",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="customer_notices",
                        to="campaigns.campaign",
                    ),
                ),
                (
                    "recipient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="campaign_notices",
                        to="accounts.user",
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(
                        fields=["recipient", "seen_at", "-created_at"],
                        name="notificatio_recipie_767303_idx",
                    )
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("recipient", "campaign"),
                        name="unique_customer_campaign_notice",
                    )
                ],
            },
        ),
    ]
