from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from asgiref.sync import async_to_sync
from django.conf import settings
from django.db import connection
from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDate
from django.db.utils import OperationalError
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from core.models import Schedule, SendLog, TelegramAccount, TelegramApp
from core.serializers import (
    AccountConfirmSerializer,
    AccountStartSerializer,
    RegisterSerializer,
    ScheduleSerializer,
    SendLogSerializer,
    TelegramAccountSerializer,
    TelegramAppWriteSerializer,
)
from core.services.telegram_auth import (
    TelegramAuthError,
    confirm_login,
    credentials_for_user,
    disconnect_session,
    env_credentials,
    list_group_dialogs,
    mask_api_hash,
    send_login_code,
)
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


class AuthConfigView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(
            {
                "registration_enabled": settings.REGISTRATION_ENABLED,
                "invite_required": bool(settings.REGISTRATION_INVITE_CODE),
            }
        )


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def post(self, request):
        if not settings.REGISTRATION_ENABLED:
            return Response(
                {"detail": "Registration is disabled."},
                status=status.HTTP_403_FORBIDDEN,
            )
        invite = settings.REGISTRATION_INVITE_CODE
        if invite:
            provided = (request.data.get("invite_code") or "").strip()
            if provided != invite:
                return Response(
                    {"detail": "Invalid or missing invite code."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
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


class TelegramAppView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        app = TelegramApp.objects.filter(owner=request.user).first()
        if app:
            api_hash = decrypt(app.api_hash_encrypted)
            return Response(
                {
                    "configured": True,
                    "has_own_app": True,
                    "using_server_fallback": False,
                    "api_id": app.api_id,
                    "api_hash_masked": mask_api_hash(api_hash),
                }
            )
        env = env_credentials()
        return Response(
            {
                "configured": bool(env),
                "has_own_app": False,
                "using_server_fallback": bool(env),
                "api_id": None,
                "api_hash_masked": "",
            }
        )

    def put(self, request):
        serializer = TelegramAppWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        api_id = serializer.validated_data["api_id"]
        api_hash = serializer.validated_data.get("api_hash") or ""
        existing = TelegramApp.objects.filter(owner=request.user).first()
        if not api_hash:
            if not existing:
                return Response(
                    {"api_hash": ["Informe o App api_hash completo."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            existing.api_id = api_id
            existing.save(update_fields=["api_id", "updated_at"])
            masked = mask_api_hash(decrypt(existing.api_hash_encrypted))
        else:
            if len(api_hash) < 8:
                return Response(
                    {"api_hash": ["Informe o App api_hash completo."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            TelegramApp.objects.update_or_create(
                owner=request.user,
                defaults={
                    "api_id": api_id,
                    "api_hash_encrypted": encrypt(api_hash),
                },
            )
            masked = mask_api_hash(api_hash)
        return Response(
            {
                "configured": True,
                "has_own_app": True,
                "using_server_fallback": False,
                "api_id": api_id,
                "api_hash_masked": masked,
            }
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

    def _telegram_creds(self, user) -> tuple[int, str]:
        return credentials_for_user(user)

    def _send_login_code(self, account: TelegramAccount) -> Response | None:
        try:
            api_id, api_hash = self._telegram_creds(account.owner)
            phone_code_hash, session_string = async_to_sync(send_login_code)(
                account.phone,
                api_id=api_id,
                api_hash=api_hash,
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
        try:
            self._telegram_creds(request.user)
        except TelegramAuthError as exc:
            return self._auth_error_response(exc)
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

    @action(detail=True, methods=["get"], url_path="dialogs")
    def dialogs(self, request, pk=None):
        """Grupos/canais da conta para escolher o destino do agendamento."""
        account = self.get_object()
        if account.status != TelegramAccount.Status.CONNECTED:
            return Response(
                {"detail": "Account must be connected."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not account.session_encrypted:
            return Response(
                {"detail": "Account has no Telegram session."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            api_id, api_hash = self._telegram_creds(account.owner)
            items = async_to_sync(list_group_dialogs)(
                decrypt(account.session_encrypted),
                api_id=api_id,
                api_hash=api_hash,
            )
        except TelegramAuthError as exc:
            return self._auth_error_response(exc)
        return Response(items)

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
            api_id, api_hash = self._telegram_creds(account.owner)
            session_string = async_to_sync(confirm_login)(
                account.phone,
                decrypt(account.session_encrypted),
                account.phone_code_hash,
                serializer.validated_data["code"],
                serializer.validated_data.get("password") or None,
                api_id=api_id,
                api_hash=api_hash,
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
            api_id, api_hash = self._telegram_creds(account.owner)
            async_to_sync(disconnect_session)(
                session_string, api_id=api_id, api_hash=api_hash
            )
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
        schedule = self.get_object()
        # Em execução não remove; pendente/falha/enviado/cancelado podem sair da lista.
        if schedule.status == Schedule.Status.RUNNING:
            return Response(
                {"detail": "Running schedules cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
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


class ReportView(APIView):
    """Resumo de envios do usuário — filtros: from, to (YYYY-MM-DD), account."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        tz = ZoneInfo(getattr(settings, "TIME_ZONE", "America/Sao_Paulo"))
        today = timezone.now().astimezone(tz).date()
        try:
            days = int(request.query_params.get("days") or 7)
        except ValueError:
            days = 7
        days = max(1, min(days, 90))

        from_raw = (request.query_params.get("from") or "").strip()
        to_raw = (request.query_params.get("to") or "").strip()
        try:
            start_date = (
                datetime.strptime(from_raw, "%Y-%m-%d").date() if from_raw else today - timedelta(days=days - 1)
            )
            end_date = datetime.strptime(to_raw, "%Y-%m-%d").date() if to_raw else today
        except ValueError:
            return Response(
                {"detail": "Use datas no formato AAAA-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if end_date < start_date:
            start_date, end_date = end_date, start_date

        start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
        end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)

        qs = Schedule.objects.filter(
            account__owner=request.user,
            run_at__gte=start_dt,
            run_at__lte=end_dt,
        )
        account_id = (request.query_params.get("account") or "").strip()
        if account_id:
            if not account_id.isdigit():
                return Response(
                    {"detail": "Conta inválida."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs = qs.filter(account_id=int(account_id), account__owner=request.user)

        counts = qs.aggregate(
            total=Count("id"),
            sent=Count("id", filter=Q(status=Schedule.Status.SENT)),
            failed=Count("id", filter=Q(status=Schedule.Status.FAILED)),
            cancelled=Count("id", filter=Q(status=Schedule.Status.CANCELLED)),
            pending=Count("id", filter=Q(status=Schedule.Status.PENDING)),
            running=Count("id", filter=Q(status=Schedule.Status.RUNNING)),
        )
        decided = (counts["sent"] or 0) + (counts["failed"] or 0)
        success_rate = round((counts["sent"] or 0) * 100 / decided, 1) if decided else None

        avg_latency = (
            SendLog.objects.filter(
                schedule__in=qs,
                success=True,
                latency_ms__isnull=False,
            ).aggregate(avg=Avg("latency_ms"))["avg"]
        )

        by_day_rows = (
            qs.annotate(day=TruncDate("run_at", tzinfo=tz))
            .values("day")
            .annotate(
                sent=Count("id", filter=Q(status=Schedule.Status.SENT)),
                failed=Count("id", filter=Q(status=Schedule.Status.FAILED)),
            )
            .order_by("day")
        )
        by_day = [
            {
                "date": row["day"].isoformat() if row["day"] else "",
                "sent": row["sent"],
                "failed": row["failed"],
            }
            for row in by_day_rows
        ]

        by_account = [
            {
                "account_id": row["account_id"],
                "label": row["account__label"] or f"#{row['account_id']}",
                "sent": row["sent"],
                "failed": row["failed"],
            }
            for row in qs.values("account_id", "account__label")
            .annotate(
                sent=Count("id", filter=Q(status=Schedule.Status.SENT)),
                failed=Count("id", filter=Q(status=Schedule.Status.FAILED)),
            )
            .order_by("-sent", "-failed")
        ]

        by_destination = []
        for row in (
            qs.values("chat_ref", "chat_title")
            .annotate(
                sent=Count("id", filter=Q(status=Schedule.Status.SENT)),
                failed=Count("id", filter=Q(status=Schedule.Status.FAILED)),
            )
            .order_by("-sent", "-failed")[:8]
        ):
            title = (row["chat_title"] or "").strip()
            ref = row["chat_ref"]
            label = title or (
                "Mensagens Salvas" if ref in ("me", "eu", "Me", "Eu") else ref
            )
            by_destination.append(
                {
                    "label": label,
                    "sent": row["sent"],
                    "failed": row["failed"],
                }
            )

        return Response(
            {
                "from": start_date.isoformat(),
                "to": end_date.isoformat(),
                "totals": {
                    "total": counts["total"] or 0,
                    "sent": counts["sent"] or 0,
                    "failed": counts["failed"] or 0,
                    "cancelled": counts["cancelled"] or 0,
                    "pending": counts["pending"] or 0,
                    "running": counts["running"] or 0,
                    "success_rate": success_rate,
                    "avg_latency_ms": int(avg_latency) if avg_latency is not None else None,
                },
                "by_day": by_day,
                "by_account": by_account,
                "by_destination": by_destination,
            }
        )
