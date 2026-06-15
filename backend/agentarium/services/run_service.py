from __future__ import annotations

import pathlib
import sqlite3
import threading
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

# In-memory store of run traces.
RUNS: dict[str, EpisodeTrace] = {}

# In-memory store of scorecards, keyed by run_id (same key as RUNS).
SCORES: dict[str, ScoreCard] = {}

# In-memory store of the simulated design, keyed by run_id (same key as RUNS).
# Retained so exports can serialize the exact design behind a trace.
DESIGNS: dict[str, DesignSpec] = {}

# Bound in-memory retention so a long-lived server doesn't grow without limit.
# The three stores share the same keys and are evicted together (oldest first);
# on-disk artifacts under runs/{run_id}/ are not touched. 200 keeps plenty of
# recent attempts replayable while capping memory.
_MAX_RETAINED_RUNS = 200

# Run artifacts directory (gitignored), relative to cwd.
_RUNS_DIR = pathlib.Path("runs")

# SQLite persistence — survives server restarts.
_DB_PATH = _RUNS_DIR / "agentarium.db"
_DB_MAX_ROWS = 1000  # keep at most 1000 runs on disk
_db_lock = threading.Lock()


def _init_db() -> None:
    _RUNS_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(_DB_PATH) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                trace_json TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS scores (
                run_id TEXT PRIMARY KEY,
                score_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS designs (
                run_id TEXT PRIMARY KEY,
                design_json TEXT NOT NULL
            );
        """)


def _db_write_run(run_id: str, trace: EpisodeTrace, design: DesignSpec) -> None:
    with _db_lock:
        with sqlite3.connect(_DB_PATH) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO runs (run_id, trace_json) VALUES (?, ?)",
                (run_id, trace.model_dump_json()),
            )
            conn.execute(
                "INSERT OR REPLACE INTO designs (run_id, design_json) VALUES (?, ?)",
                (run_id, design.model_dump_json()),
            )
            # Prune oldest rows beyond the on-disk cap, then drop scores/designs
            # whose run was pruned so those tables don't grow without bound.
            conn.execute(
                "DELETE FROM runs WHERE run_id NOT IN "
                "(SELECT run_id FROM runs ORDER BY rowid DESC LIMIT ?)",
                (_DB_MAX_ROWS,),
            )
            conn.execute("DELETE FROM scores WHERE run_id NOT IN (SELECT run_id FROM runs)")
            conn.execute("DELETE FROM designs WHERE run_id NOT IN (SELECT run_id FROM runs)")
            conn.commit()


def _db_write_score(run_id: str, score: ScoreCard) -> None:
    with _db_lock:
        with sqlite3.connect(_DB_PATH) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO scores (run_id, score_json) VALUES (?, ?)",
                (run_id, score.model_dump_json()),
            )
            conn.commit()


def _db_get_trace(run_id: str) -> EpisodeTrace | None:
    if not _DB_PATH.exists():
        return None
    with _db_lock:
        with sqlite3.connect(_DB_PATH) as conn:
            row = conn.execute(
                "SELECT trace_json FROM runs WHERE run_id = ?", (run_id,)
            ).fetchone()
    if row is None:
        return None
    try:
        return EpisodeTrace.model_validate_json(row[0])
    except Exception:
        return None


def _db_get_score(run_id: str) -> ScoreCard | None:
    if not _DB_PATH.exists():
        return None
    with _db_lock:
        with sqlite3.connect(_DB_PATH) as conn:
            row = conn.execute(
                "SELECT score_json FROM scores WHERE run_id = ?", (run_id,)
            ).fetchone()
    if row is None:
        return None
    try:
        return ScoreCard.model_validate_json(row[0])
    except Exception:
        return None


def _db_get_design(run_id: str) -> DesignSpec | None:
    if not _DB_PATH.exists():
        return None
    with _db_lock:
        with sqlite3.connect(_DB_PATH) as conn:
            row = conn.execute(
                "SELECT design_json FROM designs WHERE run_id = ?", (run_id,)
            ).fetchone()
    if row is None:
        return None
    try:
        return DesignSpec.model_validate_json(row[0])
    except Exception:
        return None


def _load_from_db() -> None:
    """Populate in-memory stores from DB on startup (most recent _MAX_RETAINED_RUNS)."""
    if not _DB_PATH.exists():
        return
    try:
        with sqlite3.connect(_DB_PATH) as conn:
            rows = conn.execute(
                "SELECT run_id, trace_json FROM runs ORDER BY rowid DESC LIMIT ?",
                (_MAX_RETAINED_RUNS,),
            ).fetchall()
            run_ids = []
            for run_id, trace_json in reversed(rows):
                try:
                    RUNS[run_id] = EpisodeTrace.model_validate_json(trace_json)
                    run_ids.append(run_id)
                except Exception:
                    pass
            for run_id in run_ids:
                row = conn.execute(
                    "SELECT score_json FROM scores WHERE run_id = ?", (run_id,)
                ).fetchone()
                if row:
                    try:
                        SCORES[run_id] = ScoreCard.model_validate_json(row[0])
                    except Exception:
                        pass
                row = conn.execute(
                    "SELECT design_json FROM designs WHERE run_id = ?", (run_id,)
                ).fetchone()
                if row:
                    try:
                        DESIGNS[run_id] = DesignSpec.model_validate_json(row[0])
                    except Exception:
                        pass
    except Exception:
        pass  # startup DB load is best-effort; server continues with empty stores


# Initialise DB and load existing runs on module import (best-effort).
try:
    _init_db()
    _load_from_db()
except Exception:
    pass


def _evict_oldest_runs() -> None:
    """Drop the oldest run(s) from all in-memory stores once over the cap.

    Dicts preserve insertion order, so the first key is the oldest run.
    """
    while len(RUNS) > _MAX_RETAINED_RUNS:
        oldest = next(iter(RUNS))
        RUNS.pop(oldest, None)
        SCORES.pop(oldest, None)
        DESIGNS.pop(oldest, None)


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
    baseline = score_attempt(trace, design, "default")
    SCORES[run_id] = baseline
    _evict_oldest_runs()

    # Persist trace + design to SQLite and trace.json to the artifact dir.
    _db_write_run(run_id, trace, design)
    _db_write_score(run_id, baseline)

    run_dir = _RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "trace.json").write_text(
        trace.model_dump_json(indent=2), encoding="utf-8"
    )

    return run_id


def get_trace(run_id: str) -> EpisodeTrace | None:
    """Return the stored trace for ``run_id``, checking DB if evicted from memory."""
    return RUNS.get(run_id) or _db_get_trace(run_id)


def store_score(run_id: str, score: ScoreCard) -> None:
    """Store ``score`` for ``run_id`` so it can be fetched later."""
    SCORES[run_id] = score
    _db_write_score(run_id, score)


def get_score(run_id: str) -> ScoreCard | None:
    """Return the stored ScoreCard for ``run_id``, checking DB if evicted from memory."""
    return SCORES.get(run_id) or _db_get_score(run_id)


def get_design(run_id: str) -> DesignSpec | None:
    """Return the design that produced ``run_id``'s trace, checking DB if evicted from memory."""
    return DESIGNS.get(run_id) or _db_get_design(run_id)
