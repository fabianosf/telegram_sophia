from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_telegramaccount_phone_code_hash"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="schedule",
            index=models.Index(
                fields=["status", "run_at"],
                name="core_sched_status_run_idx",
            ),
        ),
    ]
