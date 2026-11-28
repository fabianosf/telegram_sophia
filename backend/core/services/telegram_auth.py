import json
import time
from urllib.parse import unquote, urlparse

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


REGION_LABELS = {
    "sao_paulo": "São Paulo (Brasil)",
    "miami": "Miami (EUA)",
    "mexico": "México",
    "france": "França",
}


def configured_region_proxies() -> dict[str, str]:
    """Proxies por região definidos no servidor (JSON em TELEGRAM_REGION_PROXIES)."""
    raw = getattr(settings, "TELEGRAM_REGION_PROXIES", "") or ""
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        str(key): str(value)
        for key, value in data.items()
        if key in REGION_LABELS and value
    }


def available_regions() -> list[dict]:
    """Todas as regiões que a pessoa pode escolher. `ready` indica proxy real."""
    proxies = configured_region_proxies()
    items = [{"id": "", "label": "Automático (servidor atual)", "ready": True}]
    for key, label in REGION_LABELS.items():
        items.append({"id": key, "label": label, "ready": key in proxies})
    return items


def proxy_for_region(region: str | None):
    """Converte socks5://user:pass@host:port no formato aceito pelo Telethon."""
    if not region:
        return None
    url = configured_region_proxies().get(region)
    if not url:
        return None
    parsed = urlparse(url)
    scheme = (parsed.scheme or "socks5").lower()
    if scheme not in {"socks5", "socks4", "http"} or not parsed.hostname:
        return None
    port = parsed.port or (8080 if scheme == "http" else 1080)
    user = unquote(parsed.username) if parsed.username else None
    password = unquote(parsed.password) if parsed.password else None
    return (scheme, parsed.hostname, port, True, user, password)


def build_client(
    session_string: str = "",
    api_id: int | None = None,
    api_hash: str | None = None,
    region: str | None = None,
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
        proxy=proxy_for_region(region),
    )


async def send_login_code(
    phone: str,
    session_string: str = "",
    api_id: int | None = None,
    api_hash: str | None = None,
    region: str | None = None,
) -> tuple[str, str]:
    client = build_client(
        session_string, api_id=api_id, api_hash=api_hash, region=region
    )
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
    region: str | None = None,
) -> str:
    client = build_client(
        session_string, api_id=api_id, api_hash=api_hash, region=region
    )
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
    region: str | None = None,
) -> None:
    if not session_string:
        return
    client = build_client(
        session_string, api_id=api_id, api_hash=api_hash, region=region
    )
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
    region: str | None = None,
) -> list[dict]:
    """Lista grupos/canais da conta. Uma mensagem no grupo alcança todos os membros."""
    from telethon import utils
    from telethon.tl.types import Channel, Chat

    if not session_string:
        raise TelegramAuthError("Account has no Telegram session.", 400)
    client = build_client(
        session_string, api_id=api_id, api_hash=api_hash, region=region
    )
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


async def speed_test(
    session_string: str,
    api_id: int | None = None,
    api_hash: str | None = None,
    *,
    region: str | None = None,
    samples: int = 5,
) -> dict:
    """Mede o tempo de ida e volta até o Telegram pela região escolhida."""
    from telethon.tl.functions import PingRequest

    if not session_string:
        raise TelegramAuthError("Account has no Telegram session.", 400)
    if region and region not in configured_region_proxies():
        raise TelegramAuthError("Região não configurada no servidor.", 400)
    client = build_client(
        session_string, api_id=api_id, api_hash=api_hash, region=region
    )
    try:
        started = time.perf_counter()
        try:
            await client.connect()
        except Exception as exc:
            raise TelegramAuthError(f"Não foi possível conectar: {exc}", 502) from exc
        connect_ms = int((time.perf_counter() - started) * 1000)
        if not await client.is_user_authorized():
            raise TelegramAuthError("Session is not authorized.", 400)
        times: list[int] = []
        for _ in range(max(1, min(samples, 10))):
            t0 = time.perf_counter()
            await client(PingRequest(ping_id=int(time.time() * 1000) % (2**31)))
            times.append(int((time.perf_counter() - t0) * 1000))
        return {
            "region": region or "",
            "connect_ms": connect_ms,
            "avg_ms": int(sum(times) / len(times)),
            "min_ms": min(times),
            "samples": len(times),
        }
    except FloodWaitError as exc:
        raise TelegramAuthError(
            f"FloodWaitError: aguarde {exc.seconds}s", 429
        ) from exc
    finally:
        if client.is_connected():
            await client.disconnect()
