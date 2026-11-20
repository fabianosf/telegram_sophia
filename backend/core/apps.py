from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        from core.boot import should_validate_on_startup, validate_runtime_secrets

        if should_validate_on_startup():
            validate_runtime_secrets()
