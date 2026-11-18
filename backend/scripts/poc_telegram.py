#!/usr/bin/env python
"""POC Telethon: login interativo, persiste StringSession e envia 'teste'."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import FloodWaitError
from telethon.sessions import StringSession

ROOT = Path(__file__).resolve().parent.parent.parent
SESSION_FILE = Path(__file__).resolve().parent / ".telegram_string_session"

load_dotenv(ROOT / ".env")


def parse_chat(value: str):
    if value.lstrip("-").isdigit():
        return int(value)
    return value


def load_session() -> str:
    if SESSION_FILE.exists():
        return SESSION_FILE.read_text(encoding="utf-8").strip()
    return ""


def save_session(session: str) -> None:
    SESSION_FILE.write_text(session, encoding="utf-8")
    SESSION_FILE.chmod(0o600)


async def run(chat: str) -> None:
    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        print("Defina TELEGRAM_API_ID e TELEGRAM_API_HASH no .env", file=sys.stderr)
        sys.exit(1)

    client = TelegramClient(StringSession(load_session()), int(api_id), api_hash)

    try:
        await client.start()
        save_session(client.session.save())

        started = time.perf_counter()
        await client.send_message(parse_chat(chat), "teste")
        elapsed_ms = (time.perf_counter() - started) * 1000
        print(f"{elapsed_ms:.0f} ms")
    except FloodWaitError as exc:
        print(f"FloodWaitError: aguarde {exc.seconds}s")
        sys.exit(1)
    finally:
        await client.disconnect()


def main() -> None:
    parser = argparse.ArgumentParser(description="Envia 'teste' via Telethon.")
    parser.add_argument("chat", help="username, @user ou id numérico do chat")
    args = parser.parse_args()
    asyncio.run(run(args.chat))


if __name__ == "__main__":
    main()
