import os

from cryptography.fernet import Fernet


def _fernet() -> Fernet:
    key = os.getenv("FERNET_KEY")
    if not key:
        from django.conf import settings

        key = getattr(settings, "FERNET_KEY", "")
    if not key:
        raise ValueError("FERNET_KEY is not set")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(token: str) -> str:
    return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
