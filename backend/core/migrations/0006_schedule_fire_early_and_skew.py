from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_schedule_chat_title"),
    ]

    operations = [
        migrations.AddField(
            model_name="schedule",
            name="fire_early_ms",
            field=models.PositiveIntegerField(default=150),
        ),
        migrations.AlterField(
            model_name="schedule",
            name="lead_seconds",
            field=models.PositiveIntegerField(default=12),
        ),
        migrations.AlterField(
            model_name="schedule",
            name="retry_interval_ms",
            field=models.PositiveIntegerField(default=100),
        ),
        migrations.AddField(
            model_name="sendlog",
            name="skew_ms",
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
