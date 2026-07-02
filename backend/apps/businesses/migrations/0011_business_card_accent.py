from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('businesses', '0010_business_is_demo_business_is_paid_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='business',
            name='card_accent',
            field=models.CharField(
                blank=True,
                choices=[
                    ('terracotta', 'Terracotta'),
                    ('amber', 'Amber'),
                    ('sage', 'Sage'),
                    ('plum', 'Plum'),
                    ('indigo', 'Indigo'),
                ],
                default='',
                max_length=16,
            ),
        ),
    ]
