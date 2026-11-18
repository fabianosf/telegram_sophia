from django.urls import include, path
from rest_framework.routers import DefaultRouter

from core.views import HealthView, ScheduleViewSet, SendLogViewSet, TelegramAccountViewSet

router = DefaultRouter()
router.register("accounts", TelegramAccountViewSet, basename="account")
router.register("schedules", ScheduleViewSet, basename="schedule")
router.register("send-logs", SendLogViewSet, basename="sendlog")

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("", include(router.urls)),
]
