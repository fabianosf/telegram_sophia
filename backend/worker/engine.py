from __future__ import annotations

import asyncio
import os
import time
from datetime import timedelta
from pathlib import Path

from asgiref.sync import sync_to_async
from django.db import close_old_connections, transaction
from django.db.models import DateTimeField, DurationField, ExpressionWrapper, F, Value
from django.utils import timezone
from telethon.errors import (
    AuthKeyUnregisteredError,
    ChannelPrivateError,
    ChatAdminRequiredError,
    ChatGuestSendForbiddenError,
    ChatRestrictedError,
    ChatWriteForbiddenError,
    FloodWaitError,
    SessionExpiredError,
    SessionRevokedError,
    UserBannedInChannelError,
)

from core.models import Schedule, SendLog, TelegramAccount
from core.services.telegram_auth import build_client
from core.utils.crypto import decrypt

WRITE_ERRORS = (
    ChatWriteForbiddenError,
    ChatAdminRequiredError,
    ChatRestrictedError,
    ChatGuestSendForbiddenError,
    ChannelPrivateError,
    UserBannedInChannelError,
)
SESSION_ERRORS = (
    AuthKeyUnregisteredError,
    SessionExpiredError,
    SessionRevokedError,
)
STUCK_GRACE = timedelta(seconds=60)
HEARTBEAT_PATH = Path(
    os.environ.get("WORKER_HEARTBEAT_PATH", "/tmp/sophia_worker_heartbeat")
)


class InvalidTelegramSession(Exception):
    pass


def parse_chat_ref(value: str):
    ref = value.strip()
    if ref.lstrip("-").isdigit():
        return int(ref)
    if "t.me/" in ref:
        return ref.split("t.me/", 1)[-1].split("?")[0]
    return ref


def default_client_factory(account: TelegramAccount):
    if not account.session_encrypted:
        raise InvalidTelegramSession("Missing session")
    try:
        return build_client(decrypt(account.session_encrypted))
    except Exception as exc:
        raise InvalidTelegramSession(str(exc)) from exc


def write_heartbeat() -> None:
    HEARTBEAT_PATH.write_text(str(time.time()), encoding="utf-8")


def deadline_queryset():
    window = ExpressionWrapper(
        F("max_window_seconds") * Value(timedelta(seconds=1)),
        output_field=DurationField(),
    )
    deadline = ExpressionWrapper(F("run_at") + window, output_field=DateTimeField())
    return Schedule.objects.annotate(deadline=deadline).filter(
        status=Schedule.Status.RUNNING
    )


@sync_to_async
def reap_stuck_schedules(*, recover_in_window: bool = False) -> tuple[int, int]:
    now = timezone.now()
    if recover_in_window:
        failed = deadline_queryset().filter(deadline__lt=now).update(
            status=Schedule.Status.FAILED
        )
        recovered = Schedule.objects.filter(status=Schedule.Status.RUNNING).update(
            status=Schedule.Status.PENDING
        )
        close_old_connections()
        return failed, recovered
    failed = deadline_queryset().filter(deadline__lt=now - STUCK_GRACE).update(
        status=Schedule.Status.FAILED
    )
    close_old_connections()
    return failed, 0


def due_queryset(now):
    lead = ExpressionWrapper(
        F("lead_seconds") * Value(timedelta(seconds=1)),
        output_field=DurationField(),
    )
    due_at = ExpressionWrapper(F("run_at") - lead, output_field=DateTimeField())
    return (
        Schedule.objects.select_related("account")
        .annotate(due_at=due_at)
        .filter(status=Schedule.Status.PENDING, due_at__lte=now)
    )


@sync_to_async
def claim_due_schedules() -> list[Schedule]:
    now = timezone.now()
    with transaction.atomic():
        schedules = list(due_queryset(now).select_for_update(skip_locked=True))
        if not schedules:
            return []
        pks = [schedule.pk for schedule in schedules]
        Schedule.objects.filter(pk__in=pks, status=Schedule.Status.PENDING).update(
            status=Schedule.Status.RUNNING
        )
        for schedule in schedules:
            schedule.status = Schedule.Status.RUNNING
        return schedules


@sync_to_async
def set_schedule_status(schedule_id: int, status: str) -> int:
    return Schedule.objects.filter(pk=schedule_id).update(status=status)


@sync_to_async
def get_schedule_status(schedule_id: int) -> str:
    return Schedule.objects.values_list("status", flat=True).get(pk=schedule_id)


@sync_to_async
def set_account_error(account_id: int) -> None:
    TelegramAccount.objects.filter(pk=account_id).update(
        status=TelegramAccount.Status.ERROR
    )


@sync_to_async
def add_send_log(schedule_id: int, success: bool, error: str, latency_ms: int) -> None:
    SendLog.objects.create(
        schedule_id=schedule_id,
        attempt_at=timezone.now(),
        success=success,
        error=error,
        latency_ms=latency_ms,
    )


class ClientPool:
    def __init__(self, idle_seconds: float = 30):
        self.idle_seconds = idle_seconds
        self._clients: dict[int, object] = {}
        self._last_used: dict[int, float] = {}
        self._inflight: dict[int, int] = {}

    def get(self, account_id: int):
        return self._clients.get(account_id)

    def put(self, account_id: int, client) -> None:
        self._clients[account_id] = client
        self._last_used[account_id] = time.monotonic()

    def touch(self, account_id: int) -> None:
        if account_id in self._clients:
            self._last_used[account_id] = time.monotonic()

    def acquire(self, account_id: int) -> None:
        self._inflight[account_id] = self._inflight.get(account_id, 0) + 1
        self.touch(account_id)

    def release(self, account_id: int) -> None:
        current = self._inflight.get(account_id, 0) - 1
        if current <= 0:
            self._inflight.pop(account_id, None)
        else:
            self._inflight[account_id] = current
        self.touch(account_id)

    def inflight(self, account_id: int) -> int:
        return self._inflight.get(account_id, 0)

    async def reap(self) -> None:
        now = time.monotonic()
        for account_id, client in list(self._clients.items()):
            if self.inflight(account_id):
                continue
            last = self._last_used.get(account_id, now)
            if now - last < self.idle_seconds:
                continue
            await self._disconnect(client)
            self._clients.pop(account_id, None)
            self._last_used.pop(account_id, None)

    async def disconnect_all(self) -> None:
        for account_id, client in list(self._clients.items()):
            await self._disconnect(client)
        self._clients.clear()
        self._last_used.clear()
        self._inflight.clear()

    async def _disconnect(self, client) -> None:
        disconnect = getattr(client, "disconnect", None)
        if not disconnect:
            return
        result = disconnect()
        if asyncio.iscoroutine(result):
            await result


class WorkerEngine:
    def __init__(self, client_factory=None, idle_seconds: float = 30):
        self.client_factory = client_factory or default_client_factory
        self.pool = ClientPool(idle_seconds=idle_seconds)
        self._schedule_locks: dict[int, asyncio.Lock] = {}

    def _lock_for(self, schedule_id: int) -> asyncio.Lock:
        return self._schedule_locks.setdefault(schedule_id, asyncio.Lock())

    async def get_client(self, account: TelegramAccount):
        cached = self.pool.get(account.id)
        if cached is not None:
            self.pool.touch(account.id)
            return cached
        client = self.client_factory(account)
        connect = getattr(client, "connect", None)
        if connect:
            result = connect()
            if asyncio.iscoroutine(result):
                await result
        authorized = getattr(client, "is_user_authorized", None)
        if authorized:
            result = authorized()
            if asyncio.iscoroutine(result):
                result = await result
            if result is False:
                raise InvalidTelegramSession("Session is not authorized")
        self.pool.put(account.id, client)
        return client

    async def tick(
        self, wait_tasks: bool = True, recover_stuck: bool = False
    ) -> list[asyncio.Task]:
        await reap_stuck_schedules(recover_in_window=recover_stuck)
        claimed = await claim_due_schedules()
        tasks = [asyncio.create_task(self.process(schedule)) for schedule in claimed]
        if wait_tasks and tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await self.pool.reap()
        await sync_to_async(close_old_connections)()
        await sync_to_async(write_heartbeat)()
        return tasks

    async def run_forever(self) -> None:
        pending: set[asyncio.Task] = set()
        await reap_stuck_schedules(recover_in_window=True)
        await sync_to_async(write_heartbeat)()
        try:
            while True:
                tasks = await self.tick(wait_tasks=False)
                pending.update(tasks)
                pending = {task for task in pending if not task.done()}
                await asyncio.sleep(1)
        finally:
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
            await self.pool.disconnect_all()

    async def process(self, schedule: Schedule) -> None:
        lock = self._lock_for(schedule.id)
        async with lock:
            status = await get_schedule_status(schedule.id)
            if status != Schedule.Status.RUNNING:
                return
            account_id = schedule.account_id
            self.pool.acquire(account_id)
            try:
                await self._process_locked(schedule)
            finally:
                self.pool.release(account_id)

    async def _process_locked(self, schedule: Schedule) -> None:
        account = schedule.account
        try:
            client = await self.get_client(account)
            entity = await client.get_entity(parse_chat_ref(schedule.chat_ref))
        except SESSION_ERRORS as exc:
            await add_send_log(schedule.id, False, str(exc), 0)
            await set_account_error(account.id)
            await set_schedule_status(schedule.id, Schedule.Status.FAILED)
            return
        except InvalidTelegramSession as exc:
            await add_send_log(schedule.id, False, str(exc), 0)
            await set_account_error(account.id)
            await set_schedule_status(schedule.id, Schedule.Status.FAILED)
            return
        except Exception as exc:
            await add_send_log(schedule.id, False, str(exc), 0)
            await set_schedule_status(schedule.id, Schedule.Status.FAILED)
            return

        deadline = schedule.run_at + timedelta(seconds=schedule.max_window_seconds)
        delay = (schedule.run_at - timezone.now()).total_seconds()
        if delay > 0:
            await asyncio.sleep(delay)

        if timezone.now() > deadline:
            await set_schedule_status(schedule.id, Schedule.Status.FAILED)
            return

        interval = max(schedule.retry_interval_ms, 0) / 1000.0
        while timezone.now() <= deadline:
            current = await get_schedule_status(schedule.id)
            if current != Schedule.Status.RUNNING:
                return
            started = time.perf_counter()
            try:
                await client.send_message(entity, schedule.message)
                latency = int((time.perf_counter() - started) * 1000)
                await add_send_log(schedule.id, True, "", latency)
                await set_schedule_status(schedule.id, Schedule.Status.SENT)
                return
            except FloodWaitError as exc:
                latency = int((time.perf_counter() - started) * 1000)
                await add_send_log(
                    schedule.id, False, f"FloodWaitError: aguarde {exc.seconds}s", latency
                )
                await set_schedule_status(schedule.id, Schedule.Status.FAILED)
                return
            except SESSION_ERRORS as exc:
                latency = int((time.perf_counter() - started) * 1000)
                await add_send_log(schedule.id, False, str(exc), latency)
                await set_account_error(account.id)
                await set_schedule_status(schedule.id, Schedule.Status.FAILED)
                return
            except WRITE_ERRORS as exc:
                latency = int((time.perf_counter() - started) * 1000)
                await add_send_log(schedule.id, False, str(exc), latency)
            except Exception as exc:
                latency = int((time.perf_counter() - started) * 1000)
                await add_send_log(schedule.id, False, str(exc), latency)

            remaining = (deadline - timezone.now()).total_seconds()
            if remaining <= 0:
                break
            await asyncio.sleep(min(interval, remaining))

        if await get_schedule_status(schedule.id) == Schedule.Status.RUNNING:
            await set_schedule_status(schedule.id, Schedule.Status.FAILED)
