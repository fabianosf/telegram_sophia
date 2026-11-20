import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0003_schedule_status_run_at_index"),
    ]

    operations = [
        migrations.CreateModel(
            name="TelegramApp",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("api_id", models.PositiveIntegerField()),
                ("api_hash_encrypted", models.TextField()),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "owner",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="telegram_app",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
