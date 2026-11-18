from asgiref.sync import async_to_sync
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Schedule, SendLog, TelegramAccount
from core.serializers import (
    AccountConfirmSerializer,
    AccountStartSerializer,
    ScheduleSerializer,
    SendLogSerializer,
    TelegramAccountSerializer,
)
from core.services.telegram_auth import TelegramAuthError, confirm_login, disconnect_session, send_login_code
from core.utils.crypto import decrypt, encrypt


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"status": "ok"})


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

    def _auth_error_response(self, exc: TelegramAuthError) -> Response:
        return Response({"detail": exc.detail}, status=exc.status_code)

    @action(detail=False, methods=["post"], url_path="start")
    def start(self, request):
        serializer = AccountStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        account = TelegramAccount.objects.create(
            owner=request.user,
            label=serializer.validated_data["label"],
            phone=serializer.validated_data["phone"],
            status=TelegramAccount.Status.PENDING,
        )
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
        account.save(update_fields=["phone_code_hash", "session_encrypted"])
        return Response(
            TelegramAccountSerializer(account).data,
            status=status.HTTP_201_CREATED,
        )

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
