from django.urls import include, path
from rest_framework.routers import DefaultRouter

from core.views import (
    HealthView,
    ReportView,
    ScheduleViewSet,
    SendLogViewSet,
    TelegramAccountViewSet,
    TelegramAppView,
)

router = DefaultRouter()
router.register("accounts", TelegramAccountViewSet, basename="account")
router.register("schedules", ScheduleViewSet, basename="schedule")
router.register("send-logs", SendLogViewSet, basename="sendlog")

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("telegram-app/", TelegramAppView.as_view(), name="telegram-app"),
    path("reports/", ReportView.as_view(), name="reports"),
    path("", include(router.urls)),
]
