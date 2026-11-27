import asyncio
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from telethon.sessions import StringSession

from core.models import Schedule, SendLog, TelegramAccount, TelegramApp
from core.utils.crypto import encrypt
from worker.engine import (
    WorkerEngine,
    claim_due_schedules,
    has_imminent_work,
    parse_chat_ref,
    reap_stuck_schedules,
    resolve_destination,
)

User = get_user_model()


class FakeClient:
    def __init__(self):
        self.send_calls = 0
        self.connected = False
        self.disconnects = 0
        self.entities = []
        self.sent_to = []

    async def connect(self):
        self.connected = True

    async def disconnect(self):
        self.connected = False
        self.disconnects += 1

    def is_connected(self):
        return self.connected

    async def is_user_authorized(self):
        return True

    async def get_me(self):
        return SimpleNamespace(id=1, username="alice")

    async def get_entity(self, ref):
        self.entities.append(ref)
        return ref

    async def send_message(self, entity, message):
        self.send_calls += 1
        self.sent_to.append(entity)
        return SimpleNamespace(id=self.send_calls)


class WorkerEngineTests(TransactionTestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="secret123")
        self.account = TelegramAccount.objects.create(
            owner=self.user,
            label="Pessoal",
            phone="+5511",
            session_encrypted="encrypted-session",
            status=TelegramAccount.Status.CONNECTED,
        )
        self.client = FakeClient()
        self.engine = WorkerEngine(
            client_factory=lambda account: self.client,
            idle_seconds=0,
        )

    def tearDown(self):
        close_old_connections()
        connections.close_all()

    def _schedule(self, **kwargs):
        now = timezone.now()
        data = {
            "account": self.account,
            "chat_ref": "@chat",
            "message": "teste",
            "run_at": now,
            "lead_seconds": 0,
            "max_window_seconds": 5,
            "retry_interval_ms": 50,
            "fire_early_ms": 0,
            "status": Schedule.Status.PENDING,
        }
        data.update(kwargs)
        return Schedule.objects.create(**data)

    def test_claim_is_atomic(self):
        schedule = self._schedule()

        async def run():
            first, second = await asyncio.gather(
                claim_due_schedules(), claim_due_schedules()
            )
            return first, second

        first, second = asyncio.run(run())
        connections.close_all()
        claimed = [item.id for item in first] + [item.id for item in second]
        self.assertEqual(claimed.count(schedule.id), 1)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.RUNNING)

    def test_no_duplicate_send(self):
        schedule = self._schedule()

        async def run():
            await asyncio.gather(
                self.engine.tick(wait_tasks=True),
                self.engine.tick(wait_tasks=True),
            )

        asyncio.run(run())
        connections.close_all()
        schedule.refresh_from_db()
        self.assertEqual(self.client.send_calls, 1)
        self.assertEqual(schedule.status, Schedule.Status.SENT)
        self.assertEqual(
            SendLog.objects.filter(schedule=schedule, success=True).count(), 1
        )

    def test_due_respects_lead_seconds(self):
        future = self._schedule(
            run_at=timezone.now() + timedelta(seconds=20),
            lead_seconds=5,
        )

        async def run():
            await self.engine.tick(wait_tasks=True)

        asyncio.run(run())
        connections.close_all()
        future.refresh_from_db()
        self.assertEqual(future.status, Schedule.Status.PENDING)
        self.assertEqual(self.client.send_calls, 0)

    def test_parse_chat_ref_saved_messages(self):
        self.assertEqual(parse_chat_ref("me"), "me")
        self.assertEqual(parse_chat_ref("eu"), "me")
        self.assertEqual(parse_chat_ref("Mensagens Salvas"), "me")
        self.assertEqual(parse_chat_ref("@canal"), "@canal")
        self.assertEqual(parse_chat_ref("-1001234567890"), -1001234567890)
        self.assertEqual(
            parse_chat_ref("https://t.me/+AbCdEfGh"),
            "https://t.me/+AbCdEfGh",
        )
        self.assertEqual(
            parse_chat_ref("https://t.me/joinchat/AAAAAEHb"),
            "https://t.me/joinchat/AAAAAEHb",
        )
        self.assertEqual(parse_chat_ref("https://t.me/meugrupo"), "@meugrupo")

    def test_own_username_goes_to_saved_messages(self):
        schedule = self._schedule(chat_ref="@alice")

        async def run():
            await self.engine.tick(wait_tasks=True)

        asyncio.run(run())
        connections.close_all()
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.SENT)
        self.assertEqual(self.client.sent_to, ["me"])
        log = SendLog.objects.get(schedule=schedule, success=True)
        self.assertIn("Mensagens Salvas", log.error)

    def test_resolve_group_by_title_when_username_missing(self):
        group = SimpleNamespace(id=-1001, title="Equipe Enorme", megagroup=True)

        class DialogClient(FakeClient):
            async def get_entity(self, ref):
                raise ValueError("Nobody is using this username")

            async def get_dialogs(self, limit=None):
                return [SimpleNamespace(name="Equipe Enorme", entity=group)]

        client = DialogClient()

        async def run():
            return await resolve_destination(client, "Equipe Enorme")

        entity, label = asyncio.run(run())
        self.assertIs(entity, group)
        self.assertEqual(label, "Equipe Enorme")

    def test_reaper_fails_expired_running(self):
        schedule = self._schedule(
            status=Schedule.Status.RUNNING,
            run_at=timezone.now() - timedelta(minutes=5),
            max_window_seconds=1,
        )

        async def run():
            failed, recovered = await reap_stuck_schedules(recover_in_window=False)
            return failed, recovered

        failed, recovered = asyncio.run(run())
        connections.close_all()
        self.assertEqual(failed, 1)
        self.assertEqual(recovered, 0)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.FAILED)

    def test_reaper_recovers_running_still_in_window(self):
        schedule = self._schedule(
            status=Schedule.Status.RUNNING,
            run_at=timezone.now() + timedelta(minutes=5),
            max_window_seconds=15,
        )

        async def run():
            return await reap_stuck_schedules(recover_in_window=True)

        failed, recovered = asyncio.run(run())
        connections.close_all()
        self.assertEqual(failed, 0)
        self.assertEqual(recovered, 1)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.PENDING)

    def test_reaper_does_not_touch_live_running_during_tick(self):
        schedule = self._schedule(
            status=Schedule.Status.RUNNING,
            run_at=timezone.now() + timedelta(minutes=5),
            max_window_seconds=15,
        )

        async def run():
            return await reap_stuck_schedules(recover_in_window=False)

        asyncio.run(run())
        connections.close_all()
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.RUNNING)

    def test_reaper_marks_sent_when_success_log_exists(self):
        schedule = self._schedule(
            status=Schedule.Status.RUNNING,
            run_at=timezone.now() + timedelta(minutes=5),
            max_window_seconds=15,
        )
        SendLog.objects.create(
            schedule=schedule,
            attempt_at=timezone.now(),
            success=True,
            error="ok",
            latency_ms=1,
        )

        async def run():
            return await reap_stuck_schedules(recover_in_window=True)

        failed, recovered = asyncio.run(run())
        connections.close_all()
        self.assertEqual(failed, 0)
        self.assertEqual(recovered, 0)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.SENT)

    def test_fire_early_records_skew(self):
        schedule = self._schedule(
            run_at=timezone.now() + timedelta(milliseconds=400),
            fire_early_ms=250,
            lead_seconds=5,
            max_window_seconds=5,
        )

        async def run():
            await self.engine.tick(wait_tasks=True)

        asyncio.run(run())
        connections.close_all()
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, Schedule.Status.SENT)
        log = SendLog.objects.get(schedule=schedule, success=True)
        self.assertIsNotNone(log.skew_ms)
        # Disparo antes (ou muito perto) do horário marcado
        self.assertLess(log.skew_ms, 200)

    def test_has_imminent_work(self):
        self._schedule(run_at=timezone.now() + timedelta(seconds=5), lead_seconds=0)

        async def run():
            return await has_imminent_work(horizon_seconds=20)

        self.assertTrue(asyncio.run(run()))
        connections.close_all()


class DefaultClientFactoryAsyncTests(TransactionTestCase):
    def setUp(self):
        self.fernet_key = Fernet.generate_key().decode()
        self.settings_ctx = override_settings(
            FERNET_KEYS=[self.fernet_key],
            FERNET_KEY=self.fernet_key,
            TELEGRAM_API_ID="",
            TELEGRAM_API_HASH="",
        )
        self.settings_ctx.enable()
        self.user = User.objects.create_user(username="bob", password="secret123")
        TelegramApp.objects.create(
            owner=self.user,
            api_id=30396601,
            api_hash_encrypted=encrypt("test-api-hash-value"),
        )
        valid_session = StringSession().save()
        self.account = TelegramAccount.objects.create(
            owner=self.user,
            label="Pessoal",
            phone="+55119999",
            session_encrypted=encrypt(valid_session),
            status=TelegramAccount.Status.CONNECTED,
        )

    def tearDown(self):
        self.settings_ctx.disable()
        close_old_connections()
        connections.close_all()

    @patch("core.services.telegram_auth.TelegramClient")
    def test_default_factory_runs_without_sync_only(self, mock_client_cls):
        instance = mock_client_cls.return_value
        instance.connect = AsyncMock()
        instance.is_user_authorized = AsyncMock(return_value=True)
        instance.send_message = AsyncMock()

        async def run():
            engine = WorkerEngine(idle_seconds=0)
            client = await engine.get_client(self.account)
            await client.send_message("me", "hello")

        asyncio.run(run())
        instance.connect.assert_awaited()
        instance.is_user_authorized.assert_awaited()
        instance.send_message.assert_awaited()
