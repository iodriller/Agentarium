from fastapi.testclient import TestClient

from agentarium.app import app

client = TestClient(app)


def test_create_run_returns_id():
    r = client.post("/api/runs")
    assert r.status_code == 200
    body = r.json()
    assert "run_id" in body
    assert isinstance(body["run_id"], str)
    assert body["run_id"]


def test_get_trace():
    create = client.post("/api/runs", json={"duration_seconds": 1.0})
    assert create.status_code == 200
    run_id = create.json()["run_id"]

    r = client.get(f"/api/runs/{run_id}/trace")
    assert r.status_code == 200
    trace = r.json()
    assert trace["run_id"] == run_id
    assert trace["dt"] > 0
    assert len(trace["frames"]) > 0


def test_get_trace_404():
    r = client.get("/api/runs/does-not-exist/trace")
    assert r.status_code == 404
