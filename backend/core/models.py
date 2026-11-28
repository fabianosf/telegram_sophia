from django.conf import settings
from django.db import models


class TelegramApp(models.Model):
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="telegram_app",
    )
    api_id = models.PositiveIntegerField()
    api_hash_encrypted = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Telegram app of {self.owner}"


class TelegramAccount(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONNECTED = "connected", "Connected"
        ERROR = "error", "Error"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="telegram_accounts",
    )
    label = models.CharField(max_length=100)
    phone = models.CharField(max_length=32)
    session_encrypted = models.TextField(blank=True)
    phone_code_hash = models.CharField(max_length=128, blank=True)
    # Região de saída (proxy configurado no servidor). Vazio = conexão direta.
    region = models.CharField(max_length=16, blank=True, default="")
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.label} ({self.phone})"


class Schedule(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    account = models.ForeignKey(
        TelegramAccount,
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    chat_ref = models.CharField(max_length=255)
    chat_title = models.CharField(max_length=255, blank=True, default="")
    message = models.TextField()
    run_at = models.DateTimeField()
    lead_seconds = models.PositiveIntegerField(default=12)
    max_window_seconds = models.PositiveIntegerField(default=15)
    retry_interval_ms = models.PositiveIntegerField(default=100)
    # Dispara um pouco antes de run_at para compensar RTT (melhor posição no grupo).
    fire_early_ms = models.PositiveIntegerField(default=150)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["run_at"]
        indexes = [
            models.Index(fields=["status", "run_at"], name="core_sched_status_run_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.chat_ref} @ {self.run_at}"


class SendLog(models.Model):
    schedule = models.ForeignKey(
        Schedule,
        on_delete=models.CASCADE,
        related_name="logs",
    )
    attempt_at = models.DateTimeField()
    success = models.BooleanField()
    error = models.TextField(blank=True)
    latency_ms = models.IntegerField(null=True, blank=True)
    # attempt_at - run_at em ms (negativo = disparou antes do horário)
    skew_ms = models.IntegerField(null=True, blank=True)

    class Meta:
        ordering = ["-attempt_at"]

    def __str__(self) -> str:
        result = "ok" if self.success else "fail"
        return f"{self.schedule_id} {result} @ {self.attempt_at}"
