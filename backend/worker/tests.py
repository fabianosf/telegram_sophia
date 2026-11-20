import asyncio
from datetime import timedelta
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections
from django.test import TransactionTestCase
from django.utils import timezone

from core.models import Schedule, SendLog, TelegramAccount
from worker.engine import WorkerEngine, claim_due_schedules, reap_stuck_schedules

User = get_user_model()


class FakeClient:
    def __init__(self):
        self.send_calls = 0
        self.connected = False
        self.disconnects = 0
        self.entities = []

    async def connect(self):
        self.connected = True

    async def disconnect(self):
        self.connected = False
        self.disconnects += 1

    def is_connected(self):
        return self.connected

    async def is_user_authorized(self):
        return True

    async def get_entity(self, ref):
        self.entities.append(ref)
        return ref

    async def send_message(self, entity, message):
        self.send_calls += 1
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
