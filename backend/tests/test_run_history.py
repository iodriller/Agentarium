"""Run history + leaderboard persistence (survives restart, queryable)."""
from __future__ import annotations

import pytest

from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.setup import WorldConfig
from agentarium.services import run_service
from agentarium.services.run_service import (
    create_run_from_design,
    hardcoded_demo_design,
    leaderboard,
    list_runs,
    record_run_meta,
    store_score,
)


@pytest.fixture()
def _db(tmp_path, monkeypatch):
    monkeypatch.setattr(run_service, "_RUNS_DIR", tmp_path)
    monkeypatch.setattr(run_service, "_DB_PATH", tmp_path / "agentarium.db")
    run_service._init_db()
    return tmp_path


def _make_run(challenge: str, score: float) -> str:
    world = WorldConfig(template="flat_arena", engine="pymunk2d")
    run_id = create_run_from_design(hardcoded_demo_design(), world, duration_seconds=0.05)
    record_run_meta(run_id, project_name="P", challenge=challenge, mode="single")
    store_score(
        run_id,
        ScoreCard(
            run_id=run_id, reward="bridge_transport", score_total=score,
            success=score >= 50, metrics={}, failure_events=[], summary="", improvement_hint="",
        ),
    )
    return run_id


def test_history_lists_recent_runs(_db):
    a = _make_run("bridge_builder", 10.0)
    b = _make_run("sorter", 20.0)
    runs = list_runs(limit=10)
    ids = [r["run_id"] for r in runs]
    assert b in ids and a in ids
    # Newest first.
    assert ids.index(b) < ids.index(a)
    row = next(r for r in runs if r["run_id"] == b)
    assert row["challenge"] == "sorter"
    assert row["mode"] == "single"
    assert row["artifact_dir"]


def test_leaderboard_orders_by_score(_db):
    _make_run("bridge_builder", 10.0)
    high = _make_run("bridge_builder", 90.0)
    mid = _make_run("bridge_builder", 50.0)
    board = leaderboard(limit=3)
    assert [r["run_id"] for r in board][:2] == [high, mid]
    assert board[0]["score_total"] == 90.0


def test_leaderboard_filters_by_challenge(_db):
    bridge = _make_run("bridge_builder", 30.0)
    _make_run("sorter", 99.0)
    board = leaderboard(challenge="bridge_builder")
    assert all(r["challenge"] == "bridge_builder" for r in board)
    assert board[0]["run_id"] == bridge


def test_history_survives_simulated_restart(_db):
    rid = _make_run("crawl_challenge", 42.0)
    # Drop in-memory stores (simulate a restart) — history must persist on disk.
    run_service.RUNS.clear()
    run_service.SCORES.clear()
    run_service.DESIGNS.clear()
    runs = list_runs()
    assert any(r["run_id"] == rid for r in runs)
    row = next(r for r in runs if r["run_id"] == rid)
    assert row["score_total"] == 42.0
    assert bool(row["success"]) is False


def test_history_and_leaderboard_endpoints_respond():
    from fastapi.testclient import TestClient

    from agentarium.app import app

    client = TestClient(app)
    r1 = client.get("/api/runs/history?limit=5")
    r2 = client.get("/api/runs/leaderboard?limit=5")
    assert r1.status_code == 200 and isinstance(r1.json(), list)
    assert r2.status_code == 200 and isinstance(r2.json(), list)


def test_run_meta_pruned_with_runs_no_dead_links(_db, monkeypatch):
    # Cap on-disk runs at 2; older run_meta rows must be pruned too so history
    # never points at a run whose trace was evicted.
    monkeypatch.setattr(run_service, "_DB_MAX_ROWS", 2)
    ids = [_make_run("bridge_builder", float(i)) for i in range(4)]
    history_ids = {r["run_id"] for r in list_runs(limit=50)}
    # Only the 2 newest survive; every history row still has a fetchable trace.
    assert len(history_ids) <= 2
    for rid in history_ids:
        assert run_service.get_trace(rid) is not None
    # The two oldest are gone from history (no dead links).
    assert ids[0] not in history_ids


def test_leaderboard_excludes_null_challenge_runs(_db):
    from agentarium.core.schemas.setup import WorldConfig

    # A demo run via create_run_from_design has no challenge (null).
    world = WorldConfig(template="flat_arena", engine="pymunk2d")
    demo = create_run_from_design(hardcoded_demo_design(), world, duration_seconds=0.05)
    real = _make_run("bridge_builder", 99.0)
    board = leaderboard()  # unfiltered
    ids = {r["run_id"] for r in board}
    assert real in ids
    assert demo not in ids  # null-challenge demo runs excluded from global board


def test_upsert_meta_rejects_unknown_column(_db):
    import pytest as _pytest

    with _pytest.raises(ValueError):
        run_service._db_upsert_meta("x", bogus_col="1")
