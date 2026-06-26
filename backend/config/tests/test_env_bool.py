"""Tests for the settings env-bool parser and email TLS/timeout config.

Regression: a prod EMAIL_USE_TLS="on" was parsed as False by a strict
`== "true"` check, disabling STARTTLS and hanging the Gmail SMTP connect until
gunicorn killed the worker. `_env_bool` must treat the common truthy spellings
(notably "on") as True, and EMAIL_TIMEOUT must be set so a hung connect fails
fast instead of blocking the worker.
"""

import pytest
from django.conf import settings

from config.settings import base


@pytest.mark.parametrize(
    "value",
    ["true", "True", "TRUE", "1", "yes", "on", "ON", "y", "t", "  on  "],
)
def test_env_bool_truthy(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("SOME_FLAG", value)
    assert base._env_bool("SOME_FLAG") is True


@pytest.mark.parametrize(
    "value",
    ["false", "False", "0", "no", "off", "", "  ", "nope"],
)
def test_env_bool_falsy(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("SOME_FLAG", value)
    assert base._env_bool("SOME_FLAG") is False


def test_env_bool_missing_uses_default() -> None:
    assert base._env_bool("DEFINITELY_UNSET_VAR_XYZ") is False
    assert base._env_bool("DEFINITELY_UNSET_VAR_XYZ", default="on") is True


def test_email_timeout_is_bounded() -> None:
    # A bounded timeout prevents a hung SMTP connect from killing the worker.
    assert isinstance(settings.EMAIL_TIMEOUT, int)
    assert settings.EMAIL_TIMEOUT > 0
