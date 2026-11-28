from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_schedule_fire_early_and_skew"),
    ]

    operations = [
        migrations.AddField(
            model_name="telegramaccount",
            name="region",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
    ]
