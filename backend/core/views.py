from asgiref.sync import async_to_sync
from django.db import connection
from django.db.utils import OperationalError
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from core.models import Schedule, SendLog, TelegramAccount
from core.serializers import (
    AccountConfirmSerializer,
    AccountStartSerializer,
    RegisterSerializer,
    ScheduleSerializer,
    SendLogSerializer,
    TelegramAccountSerializer,
)
from core.services.telegram_auth import TelegramAuthError, confirm_login, disconnect_session, send_login_code
from core.throttles import AccountStartRateThrottle, LoginRateThrottle, RegisterRateThrottle
from core.utils.crypto import decrypt, encrypt


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            connection.ensure_connection()
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except OperationalError:
            return Response(
                {"status": "error", "database": "error"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"status": "ok", "database": "ok"})


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED,
        )


class TelegramAccountViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = TelegramAccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TelegramAccount.objects.filter(owner=self.request.user)

    def get_throttles(self):
        if getattr(self, "action", None) == "start":
            return [AccountStartRateThrottle()]
        return super().get_throttles()

    def _auth_error_response(self, exc: TelegramAuthError) -> Response:
        return Response({"detail": exc.detail}, status=exc.status_code)

    def _send_login_code(self, account: TelegramAccount) -> Response | None:
        try:
            phone_code_hash, session_string = async_to_sync(send_login_code)(
                account.phone
            )
        except TelegramAuthError as exc:
            account.status = TelegramAccount.Status.ERROR
            account.save(update_fields=["status"])
            return self._auth_error_response(exc)

        account.phone_code_hash = phone_code_hash
        account.session_encrypted = encrypt(session_string)
        account.status = TelegramAccount.Status.PENDING
        account.save(update_fields=["phone_code_hash", "session_encrypted", "status"])
        return None

    @action(detail=False, methods=["post"], url_path="start")
    def start(self, request):
        serializer = AccountStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        label = serializer.validated_data["label"]
        phone = serializer.validated_data["phone"]
        account = (
            TelegramAccount.objects.filter(
                owner=request.user,
                phone=phone,
                status__in=[
                    TelegramAccount.Status.PENDING,
                    TelegramAccount.Status.ERROR,
                ],
            )
            .order_by("-created_at")
            .first()
        )
        created = account is None
        if account:
            account.label = label
            account.save(update_fields=["label"])
        else:
            account = TelegramAccount.objects.create(
                owner=request.user,
                label=label,
                phone=phone,
                status=TelegramAccount.Status.PENDING,
            )
        error_response = self._send_login_code(account)
        if error_response:
            return error_response
        return Response(
            TelegramAccountSerializer(account).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="retry")
    def retry(self, request, pk=None):
        account = self.get_object()
        if account.status not in (
            TelegramAccount.Status.PENDING,
            TelegramAccount.Status.ERROR,
        ):
            return Response(
                {"detail": "Only pending or error accounts can retry login."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        error_response = self._send_login_code(account)
        if error_response:
            return error_response
        return Response(TelegramAccountSerializer(account).data)

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, pk=None):
        account = self.get_object()
        serializer = AccountConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if account.status != TelegramAccount.Status.PENDING:
            return Response(
                {"detail": "Account is not pending confirmation."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not account.session_encrypted or not account.phone_code_hash:
            return Response(
                {"detail": "Login was not started for this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            session_string = async_to_sync(confirm_login)(
                account.phone,
                decrypt(account.session_encrypted),
                account.phone_code_hash,
                serializer.validated_data["code"],
                serializer.validated_data.get("password") or None,
            )
        except TelegramAuthError as exc:
            return self._auth_error_response(exc)

        account.session_encrypted = encrypt(session_string)
        account.phone_code_hash = ""
        account.status = TelegramAccount.Status.CONNECTED
        account.save(update_fields=["session_encrypted", "phone_code_hash", "status"])
        return Response(TelegramAccountSerializer(account).data)

    def destroy(self, request, *args, **kwargs):
        account = self.get_object()
        session_string = ""
        if account.session_encrypted:
            try:
                session_string = decrypt(account.session_encrypted)
            except Exception:
                session_string = ""
        try:
            async_to_sync(disconnect_session)(session_string)
        except TelegramAuthError as exc:
            return self._auth_error_response(exc)
        account.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Schedule.objects.filter(account__owner=self.request.user).select_related(
            "account"
        )

    def _ensure_pending(self, schedule: Schedule) -> Response | None:
        if schedule.status != Schedule.Status.PENDING:
            return Response(
                {"detail": "Only pending schedules can be changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    def update(self, request, *args, **kwargs):
        blocked = self._ensure_pending(self.get_object())
        if blocked:
            return blocked
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        blocked = self._ensure_pending(self.get_object())
        if blocked:
            return blocked
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        schedule = self.get_object()
        if schedule.status != Schedule.Status.PENDING:
            return Response(
                {"detail": "Only pending schedules can be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        schedule.status = Schedule.Status.CANCELLED
        schedule.save(update_fields=["status"])
        return Response(self.get_serializer(schedule).data)


class SendLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SendLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = SendLog.objects.filter(
            schedule__account__owner=self.request.user
        ).select_related("schedule")
        schedule_id = self.request.query_params.get("schedule")
        if schedule_id:
            qs = qs.filter(schedule_id=schedule_id)
        return qs
