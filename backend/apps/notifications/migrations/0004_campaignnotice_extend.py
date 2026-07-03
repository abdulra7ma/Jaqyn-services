"""Additive schema migration: extend CampaignNotice with kind, target_url, nullable campaign.

No data migration needed — existing rows keep campaign set (non-null) and kind/
target_url null, which the model treats as a NEW_CAMPAIGN notice (backward-
compatible).

Schema-only: separate from any data backfill per backend.md migration rules.
Source: spec §C "add nullable kind + target_url (or a generic notice model
extension) so loyalty/one-away/group notices fit. Keep migration additive
(nullable, separate schema/data files if backfill needed)".
"""

from __future__ import annotations

import django.db.models.deletion

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("campaigns", "0004_remove_campaignparticipant_current_spend_and_more"),
        ("notifications", "0003_campaignnotice"),
    ]

    operations = [
        # 1. Make campaign nullable (was non-nullable CASCADE → nullable SET_NULL).
        migrations.AlterField(
            model_name="campaignnotice",
            name="campaign",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="customer_notices",
                to="campaigns.campaign",
            ),
        ),
        # 2. Add kind (nullable text choice).
        migrations.AddField(
            model_name="campaignnotice",
            name="kind",
            field=models.CharField(
                blank=True,
                null=True,
                max_length=32,
                choices=[
                    ("new_campaign", "New campaign"),
                    ("one_away", "One away"),
                    ("group_seat_filled", "Group seat filled"),
                ],
            ),
        ),
        # 3. Add target_url (nullable short URL for deep-linking).
        migrations.AddField(
            model_name="campaignnotice",
            name="target_url",
            field=models.CharField(blank=True, null=True, max_length=512),
        ),
        # 4. Update the unique constraint to be conditional on campaign non-null,
        #    so two non-campaign notices for the same recipient don't conflict.
        migrations.RemoveConstraint(
            model_name="campaignnotice",
            name="unique_customer_campaign_notice",
        ),
        migrations.AddConstraint(
            model_name="campaignnotice",
            constraint=models.UniqueConstraint(
                fields=["recipient", "campaign"],
                name="unique_customer_campaign_notice",
                condition=models.Q(campaign__isnull=False),
            ),
        ),
    ]
