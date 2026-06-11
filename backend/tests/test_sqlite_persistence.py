"""SQLite write-through and DB-fallback for evicted in-memory runs."""
from __future__ import annotations

import pytest

from agentarium.core.schemas.setup import WorldConfig
from agentarium.services import run_service
from agentarium.services.run_service import create_run_from_design, hardcoded_demo_design


def _make_run() -> str:
    design = hardcoded_demo_design()
    world = WorldConfig(template="island_cliff_small", engine="pymunk2d")
    return create_run_from_design(design, world, duration_seconds=0.05)  # noqa: E302


def test_run_written_to_db(tmp_path, monkeypatch):
    """After create_run_from_design the run_id is queryable from the DB."""
    monkeypatch.setattr(run_service, "_RUNS_DIR", tmp_path)
    monkeypatch.setattr(run_service, "_DB_PATH", tmp_path / "agentarium.db")
    run_service._init_db()

    run_id = _make_run()
    # Evict from memory to force DB path.
    run_service.RUNS.pop(run_id, None)
    run_service.SCORES.pop(run_id, None)
    run_service.DESIGNS.pop(run_id, None)

    assert run_service.get_trace(run_id) is not None
    assert run_service.get_score(run_id) is not None
    assert run_service.get_design(run_id) is not None


def test_score_written_to_db(tmp_path, monkeypatch):
    """store_score persists to DB so it survives memory eviction."""
    from agentarium.core.schemas.score import ScoreCard  # noqa: PLC0415
    monkeypatch.setattr(run_service, "_RUNS_DIR", tmp_path)
    monkeypatch.setattr(run_service, "_DB_PATH", tmp_path / "agentarium.db")
    run_service._init_db()

    run_id = _make_run()
    new_score = ScoreCard(
        run_id=run_id, reward="distance_plus_stability",
        score_total=42.0, success=True, metrics={}, failure_events=[],
        summary="test", improvement_hint="none",
    )
    run_service.store_score(run_id, new_score)
    run_service.SCORES.pop(run_id, None)

    stored = run_service.get_score(run_id)
    assert stored is not None
    assert stored.score_total == pytest.approx(42.0)


def test_unknown_run_returns_none():
    assert run_service.get_trace("nonexistent_run_id_xyz") is None
    assert run_service.get_score("nonexistent_run_id_xyz") is None
    assert run_service.get_design("nonexistent_run_id_xyz") is None
