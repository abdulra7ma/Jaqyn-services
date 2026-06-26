from django.apps import AppConfig


class BusinessesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.businesses"
    label = "businesses"

    def ready(self) -> None:
        # Register discovery-cache invalidation signals (same-app receivers via
        # @receiver decorators; cross-app senders connected explicitly).
        from apps.businesses import signals

        signals.connect_cross_app_signals()
