from fastapi.testclient import TestClient

from agentarium.app import app
from agentarium.core.schemas.design import BodyShape, BodySpec, DesignSpec
from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.trace import EpisodeTrace, Frame, FrameBody
from agentarium.services.scoring_service import (
    REWARDS,
    compute_metrics,
    score_attempt,
)

client = TestClient(app)


def _design(n: int = 1) -> DesignSpec:
    return DesignSpec(
        name="t",
        bodies=[
            BodySpec(id=f"b{i}", shape=BodyShape.box, position=[0.0, 1.0])
            for i in range(n)
        ],
    )


def _moving_trace(distance: float, *, falls: int = 0) -> EpisodeTrace:
    """A trace where body ``b0`` moves ``distance`` units in x over 3 frames."""
    half = distance / 2.0
    frames = [
        Frame(t=0.0, bodies={"b0": FrameBody(x=0.0, y=1.0, angle=0.0)}),
        Frame(t=0.5, bodies={"b0": FrameBody(x=half, y=1.0, angle=0.0)}),
        Frame(t=1.0, bodies={"b0": FrameBody(x=distance, y=1.0, angle=0.0)}),
    ]
    if falls:
        # Add a frame where the body drops below the fall threshold.
        frames.append(
            Frame(t=1.5, bodies={"b0": FrameBody(x=distance, y=-5.0, angle=0.0)})
        )
        frames.append(
            Frame(t=2.0, bodies={"b0": FrameBody(x=distance, y=1.0, angle=0.0)})
        )
    return EpisodeTrace(run_id="r", dt=0.5, frames=frames)


def test_metrics_from_trace():
    trace = _moving_trace(4.0)
    metrics = compute_metrics(trace, _design(2))
    for key in (
        "distance_m",
        "stability",
        "energy",
        "parts_used",
        "falls",
        "duration_s",
    ):
        assert key in metrics
        assert isinstance(metrics[key], float)
    assert metrics["parts_used"] == 2.0
    assert metrics["distance_m"] == 4.0
    assert metrics["duration_s"] == 1.0


def test_distance_reward_success():
    trace = _moving_trace(5.0)
    card = score_attempt(trace, _design(1), "distance_plus_stability")
    assert card.reward == "distance_plus_stability"
    assert card.success is True
    assert card.score_total > 0
    assert card.metrics["falls"] == 0.0


def test_distance_reward_falls_recorded():
    trace = _moving_trace(5.0, falls=1)
    card = score_attempt(trace, _design(1), "distance_plus_stability")
    assert card.metrics["falls"] == 1.0
    assert card.success is False
    assert any(e.get("type") == "fall" for e in card.failure_events)


def test_empty_design_zero_score():
    card = score_attempt(None, DesignSpec(name="empty"), "distance_plus_stability")
    assert card.score_total == 0.0
    assert card.success is False
    assert "empty" in card.summary.lower()
    assert any(e.get("type") == "empty_design" for e in card.failure_events)


def test_unknown_reward_uses_default():
    trace = _moving_trace(3.0)
    card = score_attempt(trace, _design(1), "nonexistent")
    assert card.reward == "default"
    assert isinstance(card, ScoreCard)


def test_all_named_rewards_registered():
    for name in ("distance_plus_stability", "sorting_accuracy", "city_score"):
        assert name in REWARDS


def test_get_score_endpoint():
    create = client.post("/api/runs", json={"duration_seconds": 1.0})
    assert create.status_code == 200
    run_id = create.json()["run_id"]

    r = client.get(f"/api/runs/{run_id}/score")
    assert r.status_code == 200
    body = r.json()
    assert "score_total" in body
    assert "metrics" in body
    assert isinstance(body["metrics"], dict)


def test_get_score_endpoint_404():
    r = client.get("/api/runs/does-not-exist/score")
    assert r.status_code == 404
