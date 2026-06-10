from __future__ import annotations

import pathlib
import uuid

from agentarium.core.schemas.design import BodyShape as _BodyShape
from agentarium.core.schemas.design import (
    BodySpec,
    DesignSpec,
    JointSpec,
    JointType,
)
from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.setup import WorldConfig
from agentarium.core.schemas.trace import EpisodeTrace
from agentarium.engines import get_engine
from agentarium.services.scoring_service import score_attempt

# In-memory store of run traces (SQLite persistence comes later).
RUNS: dict[str, EpisodeTrace] = {}

# In-memory store of scorecards, keyed by run_id (same key as RUNS).
SCORES: dict[str, ScoreCard] = {}

# In-memory store of the simulated design, keyed by run_id (same key as RUNS).
# Retained so exports can serialize the exact design behind a trace.
DESIGNS: dict[str, DesignSpec] = {}

# Run artifacts directory (gitignored), relative to cwd.
_RUNS_DIR = pathlib.Path("runs")


def hardcoded_demo_design() -> DesignSpec:
    """A small valid design that visibly moves under gravity.

    A falling box and a ball, plus a two-body pivot joint.
    """
    return DesignSpec(
        name="demo",
        bodies=[
            BodySpec(
                id="box",
                shape=_BodyShape.box,
                position=[0.0, 8.0],
                size=[1.0, 1.0],
                mass=1.0,
                color="#cc5544",
            ),
            BodySpec(
                id="ball",
                shape=_BodyShape.circle,
                position=[3.0, 10.0],
                size=[0.5],
                mass=1.0,
                color="#4488cc",
            ),
            BodySpec(
                id="arm_a",
                shape=_BodyShape.box,
                position=[-4.0, 6.0],
                size=[1.5, 0.3],
                mass=1.0,
            ),
            BodySpec(
                id="arm_b",
                shape=_BodyShape.box,
                position=[-2.5, 6.0],
                size=[1.5, 0.3],
                mass=1.0,
            ),
        ],
        joints=[
            JointSpec(
                id="pivot1",
                body_a="arm_a",
                body_b="arm_b",
                type=JointType.pivot,
                anchor_a=[0.75, 0.0],
            ),
        ],
    )


def create_run_from_design(
    design: DesignSpec,
    world: WorldConfig,
    duration_seconds: float = 5.0,
) -> str:
    """Run ``design`` with the engine named by ``world.engine`` and store the trace.

    Returns the generated run_id.
    """
    engine = get_engine(world.engine.value)
    if engine is None:
        raise ValueError(f"Unsupported engine: {world.engine.value}")

    run_id = uuid.uuid4().hex
    trace = engine.simulate(design, world, duration_seconds)
    trace.run_id = run_id

    RUNS[run_id] = trace
    DESIGNS[run_id] = design

    # Compute and store a baseline ScoreCard so every run has a fetchable
    # score. The runner may overwrite this with a reward-specific score.

    SCORES[run_id] = score_attempt(trace, design, "default")

    # Persist trace.json to runs/{run_id}/trace.json.
    run_dir = _RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "trace.json").write_text(
        trace.model_dump_json(indent=2), encoding="utf-8"
    )

    return run_id


def get_trace(run_id: str) -> EpisodeTrace | None:
    """Return the stored trace for ``run_id``, or None if missing."""
    return RUNS.get(run_id)


def store_score(run_id: str, score: ScoreCard) -> None:
    """Store ``score`` for ``run_id`` so it can be fetched later."""
    SCORES[run_id] = score


def get_score(run_id: str) -> ScoreCard | None:
    """Return the stored ScoreCard for ``run_id``, or None if missing."""
    return SCORES.get(run_id)


def get_design(run_id: str) -> DesignSpec | None:
    """Return the design that produced ``run_id``'s trace, or None if missing."""
    return DESIGNS.get(run_id)
