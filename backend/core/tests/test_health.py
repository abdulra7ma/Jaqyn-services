import pytest


@pytest.mark.django_db
def test_health_check_returns_envelope(api_client):
    response = api_client.get("/api/health/")

    assert response.status_code == 200
    assert response.data["success"] is True
    assert response.data["data"]["db"] is True
