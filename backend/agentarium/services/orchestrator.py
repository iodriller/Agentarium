from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

from agentarium.agents.runner import run_single_attempt
from agentarium.core.schemas.design import DesignSpec
from agentarium.core.schemas.setup import LaunchConfig

# Delay between streamed tool_call events so the UI sees them arrive one at a
# time. Tests set this to 0.0 to keep runs fast.
STREAM_DELAY = 0.02

# Hard cap on attempts per run for MVP responsiveness. ``run_single_attempt``
# runs the full attempt synchronously before its tool calls can be streamed, so
# more than a few attempts would make a launch feel unresponsive. The frontend's
# "live" feel comes from streaming the buffered tool calls + replaying the trace.
MAX_ATTEMPTS_CAP = 3


def _design_summary(design: DesignSpec) -> dict:
    """Approximate part categories from a DesignSpec.

    The design schema does not track beam/ramp/sensor categories, so we
    approximate: motors are joints with ``motor_rate`` set; other categories are
    0 unless we can infer them.
    """
    bodies = len(design.bodies)
    joints = len(design.joints)
    motors = sum(1 for j in design.joints if j.motor_rate is not None)
    return {
        "bodies": bodies,
        "joints": joints,
        "motors": motors,
        "sensors": 0,
        "beams": 0,
        "ramps": 0,
        "total_parts": bodies + joints,
    }


class _RunState:
    def __init__(self) -> None:
        self.events: list[dict] = []
        self.subscribers: set[asyncio.Queue[dict]] = set()
        self.finished: bool = False


class RunManager:
    """In-memory manager that runs launches as background tasks and broadcasts
    events to WebSocket subscribers while buffering full history for late
    subscribers."""

    def __init__(self) -> None:
        self._runs: dict[str, _RunState] = {}

    # ── Event plumbing ────────────────────────────────────────────────────

    def _emit(self, run_id: str, event: dict) -> None:
        state = self._runs[run_id]
        state.events.append(event)
        for queue in list(state.subscribers):
            queue.put_nowait(event)

    def get_events(self, run_id: str) -> list[dict]:
        state = self._runs.get(run_id)
        return list(state.events) if state is not None else []

    def is_finished(self, run_id: str) -> bool:
        state = self._runs.get(run_id)
        return state.finished if state is not None else False

    # ── Public API ────────────────────────────────────────────────────────

    async def create_run(self, config: LaunchConfig) -> str:
        run_id = uuid.uuid4().hex
        self._runs[run_id] = _RunState()
        asyncio.create_task(self._run(run_id, config))
        return run_id

    async def subscribe(self, run_id: str) -> AsyncIterator[dict]:
        state = self._runs.get(run_id)
        if state is None:
            yield {"type": "error", "detail": "unknown run"}
            return

        queue: asyncio.Queue[dict] = asyncio.Queue()
        # Replay buffered history first, then attach for live events. Snapshot
        # the buffer length before registering so we don't double-deliver.
        buffered = list(state.events)
        state.subscribers.add(queue)
        try:
            already_finished = state.finished
            for event in buffered:
                yield event
                if event.get("type") == "run_finished":
                    return
            if already_finished:
                # Run completed before we attached; buffered history is complete.
                return
            while True:
                event = await queue.get()
                yield event
                if event.get("type") == "run_finished":
                    return
        finally:
            state.subscribers.discard(queue)

    # ── Background execution ──────────────────────────────────────────────

    async def _run(self, run_id: str, config: LaunchConfig) -> None:
        try:
            await self._run_inner(run_id, config)
        except Exception as exc:  # noqa: BLE001 - surface failures to subscribers
            self._emit(run_id, {"type": "error", "detail": str(exc)})
            self._emit(
                run_id,
                {"type": "run_finished", "best_attempt_index": -1, "best_score": 0.0},
            )
        finally:
            self._runs[run_id].finished = True

    async def _run_inner(self, run_id: str, config: LaunchConfig) -> None:
        objective = config.scenario.objective or config.scenario.preset
        self._emit(
            run_id,
            {
                "type": "run_started",
                "run_id": run_id,
                "project_name": config.project_name,
                "mode": config.agents.mode.value,
                "objective": objective,
                "max_attempts": min(config.constraints.max_attempts, MAX_ATTEMPTS_CAP),
            },
        )

        agent_id = (
            config.agents.participants[0].id if config.agents.participants else "agent_a"
        )

        best_attempt_index = -1
        best_score = float("-inf")

        attempts = min(config.constraints.max_attempts, MAX_ATTEMPTS_CAP)
        for attempt_index in range(attempts):
            self._emit(
                run_id, {"type": "attempt_started", "attempt_index": attempt_index}
            )

            result = await run_single_attempt(config, attempt_index=attempt_index)

            for record in result.tool_calls:
                self._emit(
                    run_id,
                    {
                        "type": "tool_call",
                        "attempt_index": attempt_index,
                        "record": record.model_dump(mode="json"),
                    },
                )
                if STREAM_DELAY:
                    await asyncio.sleep(STREAM_DELAY)

            self._emit(
                run_id,
                {
                    "type": "design_update",
                    "attempt_index": attempt_index,
                    "agent_id": agent_id,
                    "summary": _design_summary(result.design),
                },
            )

            if result.trace_run_id:
                self._emit(
                    run_id,
                    {
                        "type": "trace_ready",
                        "attempt_index": attempt_index,
                        "trace_run_id": result.trace_run_id,
                    },
                )

            self._emit(
                run_id,
                {
                    "type": "score",
                    "attempt_index": attempt_index,
                    "scorecard": result.score.model_dump(mode="json"),
                },
            )

            if result.score.score_total > best_score:
                best_score = result.score.score_total
                best_attempt_index = attempt_index

            self._emit(
                run_id, {"type": "attempt_finished", "attempt_index": attempt_index}
            )

        self._emit(
            run_id,
            {
                "type": "run_finished",
                "best_attempt_index": best_attempt_index,
                "best_score": best_score if best_score != float("-inf") else 0.0,
            },
        )


run_manager = RunManager()
