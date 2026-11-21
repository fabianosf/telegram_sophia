from datetime import timedelta

from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Schedule, SendLog, TelegramAccount
from core.utils import crypto

User = get_user_model()


class ApiAuthTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="secret123")

    def test_login_returns_jwt(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "secret123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_register_returns_jwt(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "nova", "password": "Str0ngPass!x"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertTrue(User.objects.filter(username="nova").exists())

    def test_register_rejects_duplicate_username(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "alice", "password": "Str0ngPass!x"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_short_password(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "nova", "password": "short"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_health_reports_database(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["database"], "ok")

    def test_refresh_returns_access(self):
        login = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "secret123"},
            format="json",
        )
        response = self.client.post(
            "/api/auth/refresh/",
            {"refresh": login.data["refresh"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_auth_config_is_public(self):
        response = self.client.get("/api/auth/config/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("registration_enabled", response.data)
        self.assertIn("invite_required", response.data)

    @override_settings(REGISTRATION_ENABLED=False)
    def test_register_returns_403_when_disabled(self):
        response = self.client.post(
            "/api/auth/register/",
            {"username": "blocked", "password": "Str0ngPass!x"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(REGISTRATION_INVITE_CODE="secret-invite")
    def test_register_requires_invite_code(self):
        bad = self.client.post(
            "/api/auth/register/",
            {"username": "novo", "password": "Str0ngPass!x"},
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        ok = self.client.post(
            "/api/auth/register/",
            {
                "username": "convidado",
                "password": "Str0ngPass!x",
                "invite_code": "secret-invite",
            },
            format="json",
        )
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)


class SchedulePermissionTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="secret123")
        self.bob = User.objects.create_user(username="bob", password="secret123")
        self.alice_account = TelegramAccount.objects.create(
            owner=self.alice, label="Alice", phone="+5511"
        )
        self.bob_account = TelegramAccount.objects.create(
            owner=self.bob, label="Bob", phone="+5521"
        )
        self.alice_schedule = Schedule.objects.create(
            account=self.alice_account,
            chat_ref="@chat",
            message="hi",
            run_at=timezone.now() + timedelta(hours=1),
        )
        self.bob_schedule = Schedule.objects.create(
            account=self.bob_account,
            chat_ref="@other",
            message="yo",
            run_at=timezone.now() + timedelta(hours=1),
        )
        self.alice_log = SendLog.objects.create(
            schedule=self.alice_schedule,
            attempt_at=timezone.now(),
            success=True,
            latency_ms=12,
        )

    def _auth(self, user, password="secret123"):
        response = self.client.post(
            "/api/auth/login/",
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_unauthenticated_cannot_list_schedules(self):
        response = self.client.get("/api/schedules/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_sees_only_own_schedules(self):
        self._auth(self.bob)
        response = self.client.get("/api/schedules/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data}
        self.assertEqual(ids, {self.bob_schedule.id})

    def test_user_cannot_read_foreign_schedule(self):
        self._auth(self.bob)
        response = self.client.get(f"/api/schedules/{self.alice_schedule.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_cannot_use_foreign_account(self):
        self._auth(self.bob)
        response = self.client.post(
            "/api/schedules/",
            {
                "account": self.alice_account.id,
                "chat_ref": "@x",
                "message": "nope",
                "run_at": (timezone.now() + timedelta(hours=2)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_cannot_cancel_foreign_schedule(self):
        self._auth(self.bob)
        response = self.client.post(f"/api/schedules/{self.alice_schedule.id}/cancel/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_sees_only_own_send_logs(self):
        self._auth(self.bob)
        response = self.client.get("/api/send-logs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

        self._auth(self.alice)
        response = self.client.get("/api/send-logs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual({item["id"] for item in response.data}, {self.alice_log.id})


class ScheduleValidationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="secret123")
        self.account = TelegramAccount.objects.create(
            owner=self.user,
            label="Alice",
            phone="+5511",
            status=TelegramAccount.Status.CONNECTED,
        )
        login = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "secret123"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _payload(self, **overrides):
        data = {
            "account": self.account.id,
            "chat_ref": "@chat",
            "message": "teste",
            "run_at": (timezone.now() + timedelta(hours=1)).isoformat(),
            "lead_seconds": 5,
            "max_window_seconds": 15,
            "retry_interval_ms": 200,
        }
        data.update(overrides)
        return data

    def test_run_at_must_be_in_the_future(self):
        response = self.client.post(
            "/api/schedules/",
            self._payload(run_at=(timezone.now() - timedelta(minutes=1)).isoformat()),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("run_at", response.data)

    def test_lead_seconds_range(self):
        too_high = self.client.post(
            "/api/schedules/", self._payload(lead_seconds=31), format="json"
        )
        too_low = self.client.post(
            "/api/schedules/", self._payload(lead_seconds=-1), format="json"
        )
        self.assertEqual(too_high.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(too_low.status_code, status.HTTP_400_BAD_REQUEST)

    def test_max_window_seconds_range(self):
        too_high = self.client.post(
            "/api/schedules/", self._payload(max_window_seconds=61), format="json"
        )
        too_low = self.client.post(
            "/api/schedules/", self._payload(max_window_seconds=0), format="json"
        )
        self.assertEqual(too_high.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(too_low.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retry_interval_ms_minimum(self):
        response = self.client.post(
            "/api/schedules/", self._payload(retry_interval_ms=99), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("retry_interval_ms", response.data)

    def test_cancel_only_when_pending(self):
        pending = Schedule.objects.create(
            account=self.account,
            chat_ref="@chat",
            message="ok",
            run_at=timezone.now() + timedelta(hours=1),
        )
        sent = Schedule.objects.create(
            account=self.account,
            chat_ref="@chat",
            message="done",
            run_at=timezone.now() + timedelta(hours=1),
            status=Schedule.Status.SENT,
        )
        ok = self.client.post(f"/api/schedules/{pending.id}/cancel/")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        pending.refresh_from_db()
        self.assertEqual(pending.status, Schedule.Status.CANCELLED)

        bad = self.client.post(f"/api/schedules/{sent.id}/cancel/")
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        sent.refresh_from_db()
        self.assertEqual(sent.status, Schedule.Status.SENT)

    def test_create_requires_connected_account(self):
        pending = TelegramAccount.objects.create(
            owner=self.user,
            label="Pendente",
            phone="+5511998",
            status=TelegramAccount.Status.PENDING,
        )
        response = self.client.post(
            "/api/schedules/",
            self._payload(account=pending.id),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("account", response.data)

    def test_cannot_patch_non_pending_but_can_delete_finished(self):
        sent = Schedule.objects.create(
            account=self.account,
            chat_ref="@chat",
            chat_title="Grupo Demo",
            message="done",
            run_at=timezone.now() + timedelta(hours=1),
            status=Schedule.Status.SENT,
        )
        failed = Schedule.objects.create(
            account=self.account,
            chat_ref="@x",
            message="fail",
            run_at=timezone.now() + timedelta(hours=2),
            status=Schedule.Status.FAILED,
        )
        patch = self.client.patch(
            f"/api/schedules/{sent.id}/",
            {"message": "alterado"},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_400_BAD_REQUEST)
        sent.refresh_from_db()
        self.assertEqual(sent.message, "done")

        delete_sent = self.client.delete(f"/api/schedules/{sent.id}/")
        delete_failed = self.client.delete(f"/api/schedules/{failed.id}/")
        self.assertEqual(delete_sent.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(delete_failed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Schedule.objects.filter(id__in=[sent.id, failed.id]).exists())

    def test_can_patch_and_delete_pending_schedule(self):
        pending = Schedule.objects.create(
            account=self.account,
            chat_ref="@chat",
            message="ok",
            run_at=timezone.now() + timedelta(hours=1),
        )
        patch = self.client.patch(
            f"/api/schedules/{pending.id}/",
            {"message": "atualizado"},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        pending.refresh_from_db()
        self.assertEqual(pending.message, "atualizado")

        delete = self.client.delete(f"/api/schedules/{pending.id}/")
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Schedule.objects.filter(id=pending.id).exists())


class BootSecretsTests(APITestCase):
    def test_missing_secrets_fail_validation(self):
        from django.core.exceptions import ImproperlyConfigured
        from django.test import override_settings

        from core.boot import validate_runtime_secrets

        with override_settings(
            FERNET_KEY="",
            FERNET_KEYS=[],
            TELEGRAM_API_ID="1",
            TELEGRAM_API_HASH="hash",
        ):
            with self.assertRaises(ImproperlyConfigured):
                validate_runtime_secrets()

    def test_invalid_fernet_key_fails_validation(self):
        from django.core.exceptions import ImproperlyConfigured
        from django.test import override_settings

        from core.boot import validate_runtime_secrets

        with override_settings(
            FERNET_KEY="not-a-fernet-key",
            FERNET_KEYS=["not-a-fernet-key"],
            TELEGRAM_API_ID="1",
            TELEGRAM_API_HASH="hash",
        ):
            with self.assertRaises(ImproperlyConfigured):
                validate_runtime_secrets()

    def test_valid_secrets_pass(self):
        from cryptography.fernet import Fernet
        from django.test import override_settings

        from core.boot import validate_runtime_secrets

        with override_settings(
            FERNET_KEY=Fernet.generate_key().decode(),
            TELEGRAM_API_ID="",
            TELEGRAM_API_HASH="",
        ):
            validate_runtime_secrets()

    def test_weak_secret_key_fails_when_not_debug(self):
        from django.core.exceptions import ImproperlyConfigured

        from core.boot import validate_runtime_secrets

        with override_settings(
            DEBUG=False,
            SECRET_KEY="insecure-dev-key-change-me-use-at-least-32-chars",
            FERNET_KEY=Fernet.generate_key().decode(),
            TELEGRAM_API_ID="",
            TELEGRAM_API_HASH="",
        ):
            with self.assertRaises(ImproperlyConfigured):
                validate_runtime_secrets()


class FernetRotationTests(APITestCase):
    def test_decrypt_with_old_key_after_rotation(self):
        old_key = Fernet.generate_key().decode()
        new_key = Fernet.generate_key().decode()
        with override_settings(FERNET_KEYS=[new_key, old_key], FERNET_KEY=new_key):
            token_old = Fernet(old_key.encode()).encrypt(b"session-data").decode()
            self.assertEqual(crypto.decrypt(token_old), "session-data")
            fresh = crypto.encrypt("nova-sessao")
            self.assertEqual(crypto.decrypt(fresh), "nova-sessao")
