from __future__ import annotations

import os
import sys

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

SKIP_BOOT_COMMANDS = {
    "collectstatic",
    "flush",
    "makemigrations",
    "migrate",
    "showmigrations",
    "sqlmigrate",
    "test",
}


def should_validate_on_startup() -> bool:
    if os.environ.get("SKIP_BOOT_CHECKS", "").strip().lower() in {"1", "true", "yes"}:
        return False
    return not any(command in sys.argv for command in SKIP_BOOT_COMMANDS)


def validate_runtime_secrets() -> None:
    missing: list[str] = []
    if not settings.FERNET_KEY:
        missing.append("FERNET_KEY")
    if not settings.TELEGRAM_API_ID:
        missing.append("TELEGRAM_API_ID")
    if not settings.TELEGRAM_API_HASH:
        missing.append("TELEGRAM_API_HASH")
    if missing:
        raise ImproperlyConfigured(
            "Missing required environment variables: " + ", ".join(missing)
        )

    key = settings.FERNET_KEY
    try:
        Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        raise ImproperlyConfigured("FERNET_KEY is not a valid Fernet key.") from exc

    try:
        int(settings.TELEGRAM_API_ID)
    except (TypeError, ValueError) as exc:
        raise ImproperlyConfigured("TELEGRAM_API_ID must be an integer.") from exc
