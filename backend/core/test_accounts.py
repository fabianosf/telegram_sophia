from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase
from telethon.errors import PhoneCodeInvalidError, SessionPasswordNeededError

from core.models import TelegramAccount
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
