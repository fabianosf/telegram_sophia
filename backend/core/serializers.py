from django.contrib.auth import get_user_model
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.utils import timezone
from rest_framework import serializers

from core.models import Schedule, SendLog, TelegramAccount

User = get_user_model()


class TelegramAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = TelegramAccount
        fields = ("id", "label", "phone", "status", "created_at")
        read_only_fields = fields


class TelegramAppWriteSerializer(serializers.Serializer):
    api_id = serializers.IntegerField(min_value=1)
    # Vazio = manter o hash já salvo (não pedir de novo a cada visita)
    api_hash = serializers.CharField(
        required=False, allow_blank=True, max_length=128, default=""
    )

    def validate_api_hash(self, value: str) -> str:
        return (value or "").strip()


class AccountStartSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=32)


class AccountConfirmSerializer(serializers.Serializer):
    code = serializers.CharField()
    password = serializers.CharField(required=False, allow_blank=True, default="")


class ScheduleSerializer(serializers.ModelSerializer):
    lead_seconds = serializers.IntegerField(min_value=0, max_value=30, default=12)
    max_window_seconds = serializers.IntegerField(min_value=1, max_value=60, default=15)
    retry_interval_ms = serializers.IntegerField(min_value=100, default=100)
    fire_early_ms = serializers.IntegerField(min_value=0, max_value=500, default=150)

    class Meta:
        model = Schedule
        fields = (
            "id",
            "account",
            "chat_ref",
            "chat_title",
            "message",
            "run_at",
            "lead_seconds",
            "max_window_seconds",
            "retry_interval_ms",
            "fire_early_ms",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "status", "created_at")

    def validate_chat_title(self, value: str) -> str:
        return (value or "").strip()[:255]

    def validate_run_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("run_at must be in the future.")
        return value

    def validate_account(self, account: TelegramAccount):
        request = self.context.get("request")
        if request and account.owner_id != request.user.id:
            raise serializers.ValidationError("Account not found.")
        if account.status != TelegramAccount.Status.CONNECTED:
            raise serializers.ValidationError("Account must be connected.")
        return account


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(
        max_length=150,
        validators=[UnicodeUsernameValidator()],
    )
    password = serializers.CharField(write_only=True, min_length=8, max_length=128)

    def validate_username(self, value: str) -> str:
        username = value.strip()
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("Username already taken.")
        return username

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
        )


class SendLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SendLog
        fields = (
            "id",
            "schedule",
            "attempt_at",
            "success",
            "error",
            "latency_ms",
            "skew_ms",
        )
        read_only_fields = fields
