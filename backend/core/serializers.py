from django.utils import timezone
from rest_framework import serializers

from core.models import Schedule, SendLog, TelegramAccount


class TelegramAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = TelegramAccount
        fields = ("id", "label", "phone", "status", "created_at")
        read_only_fields = fields


class AccountStartSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=32)


class AccountConfirmSerializer(serializers.Serializer):
    code = serializers.CharField()
    password = serializers.CharField(required=False, allow_blank=True, default="")


class ScheduleSerializer(serializers.ModelSerializer):
    lead_seconds = serializers.IntegerField(min_value=0, max_value=30, default=5)
    max_window_seconds = serializers.IntegerField(min_value=1, max_value=60, default=15)
    retry_interval_ms = serializers.IntegerField(min_value=100, default=200)

    class Meta:
        model = Schedule
        fields = (
            "id",
            "account",
            "chat_ref",
            "message",
            "run_at",
            "lead_seconds",
            "max_window_seconds",
            "retry_interval_ms",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "status", "created_at")

    def validate_run_at(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError("run_at must be in the future.")
        return value

    def validate_account(self, account: TelegramAccount):
        request = self.context.get("request")
        if request and account.owner_id != request.user.id:
            raise serializers.ValidationError("Account not found.")
        return account


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
        )
        read_only_fields = fields
