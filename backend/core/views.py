from django.core.cache import cache
from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from core.response import success_response


class HealthView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        db_ok = True
        redis_ok = True
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception:
            db_ok = False

        try:
            cache.set("healthcheck", "ok", 5)
            redis_ok = cache.get("healthcheck") == "ok"
        except Exception:
            redis_ok = False

        return success_response({"status": "ok" if db_ok and redis_ok else "degraded", "db": db_ok, "redis": redis_ok})
