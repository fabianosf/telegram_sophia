from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from telethon.errors import PhoneCodeInvalidError, SessionPasswordNeededError

from core.models import TelegramAccount, TelegramApp
from core.utils.crypto import decrypt, encrypt

User = get_user_model()

API_SETTINGS = {
    "TELEGRAM_API_ID": "12345",
    "TELEGRAM_API_HASH": "api-hash",
}


def _mock_client(session_value="TEMP_SESSION"):
    client = MagicMock()
    client.connect = AsyncMock()
    client.disconnect = AsyncMock()
    client.is_connected.return_value = True
    client.is_user_authorized = AsyncMock(return_value=True)
    client.log_out = AsyncMock()
    client.session.save.return_value = session_value
    client.send_code_request = AsyncMock(
        return_value=SimpleNamespace(phone_code_hash="hash-abc")
    )
    client.sign_in = AsyncMock()
    return client


@override_settings(**API_SETTINGS)
class TelegramAccountAuthTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="secret123")
        self.bob = User.objects.create_user(username="bob", password="secret123")
        login = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "secret123"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _auth(self, user, password="secret123"):
        response = self.client.post(
            "/api/auth/login/",
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_unauthenticated_cannot_start(self):
        self.client.credentials()
        response = self.client.post(
            "/api/accounts/start/",
            {"label": "A", "phone": "+5511"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("core.services.telegram_auth.build_client")
    def test_start_creates_pending_account_without_exposing_session(self, mock_build):
        mock_build.return_value = _mock_client("TEMP_SESSION")
        response = self.client.post(
            "/api/accounts/start/",
            {"label": "Pessoal", "phone": "+5511999"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], TelegramAccount.Status.PENDING)
        self.assertEqual(response.data["phone"], "+5511999")
        self.assertNotIn("session_encrypted", response.data)
        self.assertNotIn("phone_code_hash", response.data)
        self.assertNotIn("TEMP_SESSION", str(response.data))

        account = TelegramAccount.objects.get(id=response.data["id"])
        self.assertEqual(account.owner, self.alice)
        self.assertEqual(account.phone_code_hash, "hash-abc")
        self.assertEqual(decrypt(account.session_encrypted), "TEMP_SESSION")

    @patch("core.services.telegram_auth.build_client")
    def test_confirm_connects_and_hides_session(self, mock_build):
        mock_build.return_value = _mock_client("FULL_SESSION")
        account = TelegramAccount.objects.create(
            owner=self.alice,
            label="Pessoal",
            phone="+5511999",
            phone_code_hash="hash-abc",
            session_encrypted=encrypt("TEMP_SESSION"),
            status=TelegramAccount.Status.PENDING,
        )
        response = self.client.post(
            f"/api/accounts/{account.id}/confirm/",
            {"code": "12345"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], TelegramAccount.Status.CONNECTED)
        self.assertNotIn("session_encrypted", response.data)
        self.assertNotIn("FULL_SESSION", str(response.data))

        account.refresh_from_db()
        self.assertEqual(account.status, TelegramAccount.Status.CONNECTED)
        self.assertEqual(account.phone_code_hash, "")
        self.assertEqual(decrypt(account.session_encrypted), "FULL_SESSION")

    @patch("core.services.telegram_auth.build_client")
    def test_confirm_requires_2fa_password(self, mock_build):
        client = _mock_client()
        client.sign_in = AsyncMock(side_effect=SessionPasswordNeededError(None))
        mock_build.return_value = client
        account = TelegramAccount.objects.create(
            owner=self.alice,
            label="Pessoal",
            phone="+5511999",
            phone_code_hash="hash-abc",
            session_encrypted=encrypt("TEMP_SESSION"),
            status=TelegramAccount.Status.PENDING,
        )
        response = self.client.post(
            f"/api/accounts/{account.id}/confirm/",
            {"code": "12345"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Two-factor", response.data["detail"])
        account.refresh_from_db()
        self.assertEqual(account.status, TelegramAccount.Status.PENDING)

    @patch("core.services.telegram_auth.build_client")
    def test_confirm_with_2fa_password(self, mock_build):
        client = _mock_client("FULL_SESSION")

        async def sign_in(*args, **kwargs):
            if "password" not in kwargs:
                raise SessionPasswordNeededError(None)

        client.sign_in = AsyncMock(side_effect=sign_in)
        mock_build.return_value = client
        account = TelegramAccount.objects.create(
            owner=self.alice,
            label="Pessoal",
            phone="+5511999",
            phone_code_hash="hash-abc",
            session_encrypted=encrypt("TEMP_SESSION"),
            status=TelegramAccount.Status.PENDING,
        )
        response = self.client.post(
            f"/api/accounts/{account.id}/confirm/",
            {"code": "12345", "password": "secret"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        account.refresh_from_db()
        self.assertEqual(account.status, TelegramAccount.Status.CONNECTED)

    @patch("core.services.telegram_auth.build_client")
    def test_confirm_invalid_code(self, mock_build):
        client = _mock_client()
        client.sign_in = AsyncMock(side_effect=PhoneCodeInvalidError(None))
        mock_build.return_value = client
        account = TelegramAccount.objects.create(
            owner=self.alice,
            label="Pessoal",
            phone="+5511999",
            phone_code_hash="hash-abc",
            session_encrypted=encrypt("TEMP_SESSION"),
            status=TelegramAccount.Status.PENDING,
        )
        response = self.client.post(
            f"/api/accounts/{account.id}/confirm/",
            {"code": "00000"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid confirmation code", response.data["detail"])
        account.refresh_from_db()
        self.assertEqual(account.status, TelegramAccount.Status.PENDING)

    @patch("core.services.telegram_auth.build_client")
    def test_delete_disconnects_and_removes(self, mock_build):
        client = _mock_client()
        mock_build.return_value = client
        account = TelegramAccount.objects.create(
            owner=self.alice,
            label="Pessoal",
            phone="+5511999",
            session_encrypted=encrypt("FULL_SESSION"),
            status=TelegramAccount.Status.CONNECTED,
        )
        response = self.client.delete(f"/api/accounts/{account.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TelegramAccount.objects.filter(id=account.id).exists())
        client.log_out.assert_awaited()

    def test_cannot_confirm_foreign_account(self):
        account = TelegramAccount.objects.create(
            owner=self.bob,
            label="Bob",
            phone="+5521",
            phone_code_hash="hash-abc",
            session_encrypted=encrypt("TEMP_SESSION"),
            status=TelegramAccount.Status.PENDING,
        )
        response = self.client.post(
            f"/api/accounts/{account.id}/confirm/",
            {"code": "12345"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_delete_foreign_account(self):
        account = TelegramAccount.objects.create(
            owner=self.bob, label="Bob", phone="+5521"
        )
        response = self.client.delete(f"/api/accounts/{account.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(TelegramAccount.objects.filter(id=account.id).exists())

    @patch("core.services.telegram_auth.build_client")
    def test_start_reuses_error_account_same_phone(self, mock_build):
        mock_build.return_value = _mock_client("TEMP_SESSION")
        account = TelegramAccount.objects.create(
            owner=self.alice,
            label="Antiga",
            phone="+5511999",
            status=TelegramAccount.Status.ERROR,
        )
        response = self.client.post(
            "/api/accounts/start/",
            {"label": "Pessoal", "phone": "+5511999"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], account.id)
        self.assertEqual(
            TelegramAccount.objects.filter(owner=self.alice, phone="+5511999").count(),
            1,
        )
        account.refresh_from_db()
        self.assertEqual(account.status, TelegramAccount.Status.PENDING)
        self.assertEqual(account.label, "Pessoal")

    @patch("core.services.telegram_auth.build_client")
    def test_retry_resends_code_for_error_account(self, mock_build):
        mock_build.return_value = _mock_client("TEMP_SESSION")
        account = TelegramAccount.objects.create(
            owner=self.alice,
            label="Pessoal",
            phone="+5511999",
            status=TelegramAccount.Status.ERROR,
        )
        response = self.client.post(f"/api/accounts/{account.id}/retry/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], account.id)
        account.refresh_from_db()
        self.assertEqual(account.status, TelegramAccount.Status.PENDING)
        self.assertEqual(account.phone_code_hash, "hash-abc")

    def test_retry_rejects_connected_account(self):
        account = TelegramAccount.objects.create(
            owner=self.alice,
            label="Pessoal",
            phone="+5511999",
            status=TelegramAccount.Status.CONNECTED,
        )
        response = self.client.post(f"/api/accounts/{account.id}/retry/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        account.refresh_from_db()
        self.assertEqual(account.status, TelegramAccount.Status.CONNECTED)


@override_settings(TELEGRAM_API_ID="", TELEGRAM_API_HASH="")
class TelegramAppConfigTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="secret123")
        login = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "secret123"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def test_get_unconfigured_without_env(self):
        response = self.client.get("/api/telegram-app/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["configured"])
        self.assertFalse(response.data["has_own_app"])

    def test_put_saves_and_masks_hash(self):
        response = self.client.put(
            "/api/telegram-app/",
            {"api_id": 30396601, "api_hash": "d41cee75e1b994ebc82a09726255a303"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["has_own_app"])
        self.assertEqual(response.data["api_id"], 30396601)
        self.assertNotIn("d41cee75e1b994ebc82a09726255a303", str(response.data))
        self.assertTrue(response.data["api_hash_masked"].startswith("d41c"))
        app = TelegramApp.objects.get(owner=self.user)
        self.assertEqual(
            decrypt(app.api_hash_encrypted), "d41cee75e1b994ebc82a09726255a303"
        )

    def test_put_keeps_hash_when_blank(self):
        TelegramApp.objects.create(
            owner=self.user,
            api_id=111,
            api_hash_encrypted=encrypt("keep-this-hash-value"),
        )
        response = self.client.put(
            "/api/telegram-app/",
            {"api_id": 222, "api_hash": ""},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["api_id"], 222)
        app = TelegramApp.objects.get(owner=self.user)
        self.assertEqual(app.api_id, 222)
        self.assertEqual(decrypt(app.api_hash_encrypted), "keep-this-hash-value")

    @patch("core.services.telegram_auth.build_client")
    def test_start_without_credentials_fails(self, mock_build):
        response = self.client.post(
            "/api/accounts/start/",
            {"label": "Pessoal", "phone": "+5511999"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Configuração", response.data["detail"])
        mock_build.assert_not_called()


    @patch("core.services.telegram_auth.build_client")
    def test_start_uses_user_telegram_app(self, mock_build):
        mock_build.return_value = _mock_client("TEMP_SESSION")
        TelegramApp.objects.create(
            owner=self.user,
            api_id=111,
            api_hash_encrypted=encrypt("user-hash-value"),
        )
        response = self.client.post(
            "/api/accounts/start/",
            {"label": "Pessoal", "phone": "+5511999"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mock_build.assert_called()
        kwargs = mock_build.call_args.kwargs
        self.assertEqual(kwargs.get("api_id"), 111)
        self.assertEqual(kwargs.get("api_hash"), "user-hash-value")


@override_settings(**API_SETTINGS)
class AccountDialogsTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="secret123")
        login = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "secret123"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.account = TelegramAccount.objects.create(
            owner=self.user,
            label="Pessoal",
            phone="+5511",
            session_encrypted=encrypt("SESSION"),
            status=TelegramAccount.Status.CONNECTED,
        )

    @patch("core.views.list_group_dialogs", new_callable=AsyncMock)
    def test_lists_groups_for_picker(self, mock_list):
        mock_list.return_value = [
            {
                "title": "Grupo Enorme",
                "chat_ref": "@grupoenorme",
                "kind": "group",
                "participants": 2000,
            }
        ]
        response = self.client.get(f"/api/accounts/{self.account.id}/dialogs/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["chat_ref"], "@grupoenorme")
        self.assertEqual(response.data[0]["kind"], "group")
        mock_list.assert_awaited()


REGION_SETTINGS = {
    **API_SETTINGS,
    "TELEGRAM_REGION_PROXIES": '{"miami": "socks5://u:p%40ss@10.0.0.1:1080"}',
}


@override_settings(**REGION_SETTINGS)
class AccountRegionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="secret123")
        login = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "secret123"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        self.account = TelegramAccount.objects.create(
            owner=self.user,
            label="Pessoal",
            phone="+5511",
            session_encrypted=encrypt("SESSION"),
            status=TelegramAccount.Status.CONNECTED,
        )

    def test_lists_only_configured_regions(self):
        response = self.client.get("/api/accounts/regions/")
        ids = [r["id"] for r in response.data]
        self.assertEqual(ids, ["", "miami"])

    @override_settings(TELEGRAM_REGION_PROXIES="")
    def test_no_regions_without_proxies(self):
        response = self.client.get("/api/accounts/regions/")
        self.assertEqual([r["id"] for r in response.data], [""])

    def test_set_region_and_reject_unknown(self):
        ok = self.client.post(
            f"/api/accounts/{self.account.id}/region/",
            {"region": "miami"},
            format="json",
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK)
        self.account.refresh_from_db()
        self.assertEqual(self.account.region, "miami")
        bad = self.client.post(
            f"/api/accounts/{self.account.id}/region/",
            {"region": "mexico"},
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_proxy_parsing(self):
        from core.services.telegram_auth import proxy_for_region

        self.assertEqual(
            proxy_for_region("miami"), ("socks5", "10.0.0.1", 1080, True, "u", "p@ss")
        )
        self.assertIsNone(proxy_for_region(""))
        self.assertIsNone(proxy_for_region("france"))

    @patch("core.views.speed_test", new_callable=AsyncMock)
    def test_speed_test_uses_requested_region(self, mock_speed):
        mock_speed.return_value = {
            "region": "miami",
            "connect_ms": 80,
            "avg_ms": 40,
            "min_ms": 35,
            "samples": 5,
        }
        response = self.client.post(
            f"/api/accounts/{self.account.id}/speed-test/",
            {"region": "miami"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["avg_ms"], 40)
        self.assertEqual(mock_speed.await_args.kwargs["region"], "miami")
