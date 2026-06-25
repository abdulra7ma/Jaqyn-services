# Generated manually — creates the BusinessImage table.
# New table: non-locking (CREATE TABLE acquires no row locks on existing tables).
# Safe to run while the app serves traffic.

import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0006_catalogitem_image"),
    ]

    operations = [
        migrations.CreateModel(
            name="BusinessImage",
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
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "business",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="gallery_images",
                        to="businesses.business",
                    ),
                ),
                (
                    "image",
                    models.ImageField(upload_to="business/gallery/"),
                ),
                ("caption", models.CharField(blank=True, max_length=255)),
                ("sort_order", models.IntegerField(default=0)),
            ],
            options={
                "ordering": ("sort_order", "created_at"),
            },
        ),
    ]
