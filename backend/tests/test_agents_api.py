from fastapi.testclient import TestClient

from agentarium.app import app

client = TestClient(app)


def test_list_providers():
    r = client.get("/api/agents/providers")
    assert r.status_code == 200
    body = r.json()
    ids = {p["id"] for p in body}
    assert len(body) == 4
    assert "mock" in ids
    assert "localdeploy" in ids


def test_mock_connection_online():
    r = client.post("/api/agents/test-connection", json={"provider": "mock"})
    assert r.status_code == 200
    body = r.json()
    assert body["online"] is True


def test_unknown_provider_400():
    r = client.post("/api/agents/test-connection", json={"provider": "nonsense"})
    assert r.status_code == 400


def test_mock_structured_output():
    r = client.post(
        "/api/agents/test-structured-output",
        json={"provider": "mock", "model": "mock"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert len(body["sample"]) > 0


def test_offline_endpoint():
    r = client.post(
        "/api/agents/test-connection",
        json={"provider": "localdeploy", "endpoint_url": "http://127.0.0.1:9/v1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["online"] is False
