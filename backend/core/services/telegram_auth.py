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


def _credentials() -> tuple[int, str]:
    api_id = settings.TELEGRAM_API_ID
    api_hash = settings.TELEGRAM_API_HASH
    if not api_id or not api_hash:
        raise TelegramAuthError("Telegram API credentials are not configured.", 503)
    return int(api_id), api_hash


def build_client(session_string: str = "") -> TelegramClient:
    api_id, api_hash = _credentials()
    return TelegramClient(StringSession(session_string or ""), api_id, api_hash)


async def send_login_code(phone: str, session_string: str = "") -> tuple[str, str]:
    client = build_client(session_string)
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
) -> str:
    client = build_client(session_string)
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


async def disconnect_session(session_string: str) -> None:
    if not session_string:
        return
    client = build_client(session_string)
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
