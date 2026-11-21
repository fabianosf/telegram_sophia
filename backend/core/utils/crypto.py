import os

from cryptography.fernet import Fernet, MultiFernet


def _load_fernet_keys() -> list[str]:
    from django.conf import settings

    keys: list[str] = []
    if hasattr(settings, "FERNET_KEYS") and settings.FERNET_KEYS:
        keys.extend(settings.FERNET_KEYS)
    elif getattr(settings, "FERNET_KEY", ""):
        keys.append(settings.FERNET_KEY)

    if not keys:
        key = os.getenv("FERNET_KEY")
        if key:
            keys.append(key)
    if not keys:
        raise ValueError("FERNET_KEY is not set")
    return keys


def _fernet() -> MultiFernet:
    keys = _load_fernet_keys()
    return MultiFernet([Fernet(k.encode() if isinstance(k, str) else k) for k in keys])


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")