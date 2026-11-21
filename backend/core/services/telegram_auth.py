from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    SessionPasswordNeededError,
)
from telethon.sessions import StringSession

from django.conf import settings


class TelegramAuthError(Exception):
    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


class TwoFactorRequired(TelegramAuthError):
    def __init__(self):
        super().__init__("Two-factor password required.", 400)


def env_credentials() -> tuple[int, str] | None:
    api_id = settings.TELEGRAM_API_ID
    api_hash = settings.TELEGRAM_API_HASH
    if not api_id or not api_hash:
        return None
    return int(api_id), str(api_hash)


def mask_api_hash(value: str) -> str:
    if len(value) <= 8:
        return "•" * len(value)
    return f"{value[:4]}{'•' * (len(value) - 8)}{value[-4:]}"


def credentials_for_user(user) -> tuple[int, str]:
    from core.models import TelegramApp
    from core.utils.crypto import decrypt

    app = TelegramApp.objects.filter(owner_id=user.pk).first()
    if app and app.api_hash_encrypted:
        return app.api_id, decrypt(app.api_hash_encrypted)
    env = env_credentials()
    if env:
        return env
    raise TelegramAuthError(
        "Configure seu app Telegram em Configuração (api_id e api_hash).",
        400,
    )


def build_client(
    session_string: str = "",
    api_id: int | None = None,
    api_hash: str | None = None,
) -> TelegramClient:
    if api_id is None or not api_hash:
        creds = env_credentials()
        if not creds:
            raise TelegramAuthError(
                "Configure seu app Telegram em Configuração (api_id e api_hash).",
                400,
            )
        api_id, api_hash = creds
    return TelegramClient(
        StringSession(session_string or ""),
        int(api_id),
        api_hash,
        flood_sleep_threshold=0,
    )


async def send_login_code(
    phone: str,
    session_string: str = "",
    api_id: int | None = None,
    api_hash: str | None = None,
) -> tuple[str, str]:
    client = build_client(session_string, api_id=api_id, api_hash=api_hash)
    await client.connect()
    try:
        try:
            sent = await client.send_code_request(phone)
        except FloodWaitError as exc:
            raise TelegramAuthError(
                f"FloodWaitError: aguarde {exc.seconds}s", 429
            ) from exc
        return sent.phone_code_hash, client.session.save()
    finally:
        await client.disconnect()


async def confirm_login(
    phone: str,
    session_string: str,
    phone_code_hash: str,
    code: str,
    password: str | None = None,
    api_id: int | None = None,
    api_hash: str | None = None,
) -> str:
    client = build_client(session_string, api_id=api_id, api_hash=api_hash)
    await client.connect()
    try:
        try:
            await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
        except SessionPasswordNeededError:
            if not password:
                raise TwoFactorRequired() from None
            try:
                await client.sign_in(password=password)
            except PasswordHashInvalidError as exc:
                raise TelegramAuthError("Invalid 2FA password.", 400) from exc
        except PhoneCodeInvalidError as exc:
            raise TelegramAuthError("Invalid confirmation code.", 400) from exc
        except PhoneCodeExpiredError as exc:
            raise TelegramAuthError("Confirmation code expired.", 400) from exc
        except FloodWaitError as exc:
            raise TelegramAuthError(
                f"FloodWaitError: aguarde {exc.seconds}s", 429
            ) from exc
        return client.session.save()
    finally:
        await client.disconnect()


async def disconnect_session(
    session_string: str,
    api_id: int | None = None,
    api_hash: str | None = None,
) -> None:
    if not session_string:
        return
    client = build_client(session_string, api_id=api_id, api_hash=api_hash)
    await client.connect()
    try:
        if await client.is_user_authorized():
            await client.log_out()
        else:
            await client.disconnect()
    except FloodWaitError as exc:
        raise TelegramAuthError(
            f"FloodWaitError: aguarde {exc.seconds}s", 429
        ) from exc
    finally:
        if client.is_connected():
            await client.disconnect()


async def list_group_dialogs(
    session_string: str,
    api_id: int | None = None,
    api_hash: str | None = None,
    *,
    limit: int = 80,
) -> list[dict]:
    """Lista grupos/canais da conta. Uma mensagem no grupo alcança todos os membros."""
    from telethon import utils
    from telethon.tl.types import Channel, Chat

    if not session_string:
        raise TelegramAuthError("Account has no Telegram session.", 400)
    client = build_client(session_string, api_id=api_id, api_hash=api_hash)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            raise TelegramAuthError("Session is not authorized.", 400)
        dialogs = await client.get_dialogs(limit=limit)
        items: list[dict] = []
        for dialog in dialogs:
            entity = dialog.entity
            if isinstance(entity, Chat):
                kind = "group"
            elif isinstance(entity, Channel):
                kind = "channel" if entity.broadcast and not entity.megagroup else "group"
            else:
                continue
            username = getattr(entity, "username", None) or ""
            chat_ref = f"@{username}" if username else str(utils.get_peer_id(entity))
            items.append(
                {
                    "title": dialog.name or getattr(entity, "title", "") or chat_ref,
                    "chat_ref": chat_ref,
                    "kind": kind,
                    "participants": getattr(entity, "participants_count", None),
                }
            )
        return items
    except FloodWaitError as exc:
        raise TelegramAuthError(
            f"FloodWaitError: aguarde {exc.seconds}s", 429
        ) from exc
    finally:
        if client.is_connected():
            await client.disconnect()
