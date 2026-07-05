"""Assert that Django's security middleware emits the Phase-C security headers.

These headers are controlled by settings in base.py (applied to every env) and
injected by SecurityMiddleware / XFrameOptionsMiddleware on every response.  The
test hits the existing /api/health/ endpoint (always reachable, no auth required)
and checks that the three headers are present with the expected values.

Why a response test (not a settings assertion): the settings alone don't prove
the middleware is wired up correctly.  A live request through the full middleware
stack is the only reliable proof that the headers actually reach the client.
"""

import pytest


@pytest.mark.django_db
def test_security_headers_on_response(api_client):
    """X-Content-Type-Options, X-Frame-Options, and Referrer-Policy are present."""
    response = api_client.get("/api/health/")

    # SECURE_CONTENT_TYPE_NOSNIFF = True → SecurityMiddleware adds this header.
    assert response.headers.get("X-Content-Type-Options") == "nosniff", (
        "SecurityMiddleware should set X-Content-Type-Options: nosniff "
        "(SECURE_CONTENT_TYPE_NOSNIFF = True)"
    )

    # X_FRAME_OPTIONS = "DENY" → XFrameOptionsMiddleware adds this header.
    assert response.headers.get("X-Frame-Options") == "DENY", (
        "XFrameOptionsMiddleware should set X-Frame-Options: DENY "
        "(X_FRAME_OPTIONS = 'DENY')"
    )

    # SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin" →
    # SecurityMiddleware adds this header.
    assert (
        response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    ), (
        "SecurityMiddleware should set Referrer-Policy: strict-origin-when-cross-origin "
        "(SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin')"
    )
