from .base import *  # noqa: F403

DEBUG = True
CELERY_TASK_ALWAYS_EAGER = True

# Dev-only: accept requests from any origin so a frontend on any localhost port
# (multiple preview sessions) can call the backend directly. The app authenticates
# with Bearer tokens, not cookies, so we don't enable credentialed CORS. NEVER in prod.
CORS_ALLOW_ALL_ORIGINS = True
