# Generated manually — additive/nullable column on CatalogItem.
# Non-locking: nullable ImageField adds a column with DEFAULT NULL; no table
# scan or row rewrite is needed under Postgres. Safe to run while app serves traffic.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0005_add_pending_owner_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="catalogitem",
            name="image",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to="business/catalog/",
            ),
        ),
    ]
