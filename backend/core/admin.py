from django.contrib import admin

from core.models import Schedule, SendLog, TelegramAccount, TelegramApp


@admin.register(TelegramApp)
class TelegramAppAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "api_id", "updated_at")
    search_fields = ("owner__username",)
    readonly_fields = ("updated_at",)
    exclude = ("api_hash_encrypted",)


@admin.register(TelegramAccount)
class TelegramAccountAdmin(admin.ModelAdmin):
    list_display = ("id", "label", "phone", "owner", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("label", "phone", "owner__username")
    readonly_fields = ("created_at",)
    exclude = ("session_encrypted",)


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "account",
        "chat_ref",
        "run_at",
        "status",
        "lead_seconds",
        "max_window_seconds",
        "fire_early_ms",
        "created_at",
    )
    list_filter = ("status",)
    search_fields = ("chat_ref", "message")
    readonly_fields = ("created_at",)


@admin.register(SendLog)
class SendLogAdmin(admin.ModelAdmin):
    list_display = ("id", "schedule", "attempt_at", "success", "latency_ms", "skew_ms")
    list_filter = ("success",)
    search_fields = ("error",)
    readonly_fields = ("attempt_at",)
