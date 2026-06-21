import pytest
from django.core.cache import cache as django_cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def cache_isolation():
    django_cache.clear()


@pytest.fixture(autouse=True)
def disable_dev_otp(settings):
    # The dev static-OTP bypass must never leak into the suite via .env. Tests that
    # exercise it opt in by setting settings.DEV_LOGIN_OTP themselves.
    settings.DEV_LOGIN_OTP = ""


@pytest.fixture
def api_client():
    return APIClient()
