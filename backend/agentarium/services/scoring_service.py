"""Scoring service: derive metrics from a trace and apply a named reward.

The pipeline is:

1. ``compute_metrics`` turns an :class:`EpisodeTrace` (plus the
   :class:`DesignSpec`) into a flat ``dict[str, float]`` of deterministic
   metrics.
2. A named reward function in :data:`REWARDS` maps that metrics dict to a
   ``(score_total, success, summary)`` tuple.
3. ``score_attempt`` ties the two together and produces a
   :class:`ScoreCard`.

All math is defensive: empty frames, missing bodies and designs with no
dynamic bodies must never raise.
"""

from __future__ import annotations

import math
from collections.abc import Callable

from agentarium.core.schemas.design import DesignSpec
from agentarium.core.schemas.score import ScoreCard
from agentarium.core.schemas.trace import EpisodeTrace

# y position (in world units) below which the primary body is considered to
# have fallen off / collapsed below the ground line.
_FALL_Y_THRESHOLD = -0.5


def _dynamic_bodies(design: DesignSpec) -> list[str]:
    """Ids of bodies that can actually move (non-static)."""
    return [b.id for b in design.bodies if not b.static]


def _primary_body_id(trace: EpisodeTrace, design: DesignSpec) -> str | None:
    """Pick the body whose horizontal travel we treat as "the result".

    Rule: among dynamic bodies present in the trace, choose the one that
    travelled the furthest in x (first vs last frame). Falls back to the
    first dynamic body, then the first body present in the trace.
    """
    if not trace.frames:
        return None

    first = trace.frames[0].bodies
    last = trace.frames[-1].bodies
    dynamic = [bid for bid in _dynamic_bodies(design) if bid in first and bid in last]

    if dynamic:
        return max(dynamic, key=lambda bid: abs(last[bid].x - first[bid].x))

    # No dynamic bodies known from the design; use anything in the trace.
    candidates = [bid for bid in first if bid in last]
    if candidates:
        return max(candidates, key=lambda bid: abs(last[bid].x - first[bid].x))
    return None


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def compute_metrics(trace: EpisodeTrace, design: DesignSpec) -> dict[str, float]:
    """Derive a flat metrics dict from ``trace`` and ``design``.

    Always returns floats and never raises on empty / short traces.

    Energy proxy: total path length travelled by all dynamic bodies summed
    across consecutive frames (Manhattan distance per step). This is a
    deterministic, monotonic stand-in for "effort expended".
    """
    parts_used = float(len(design.bodies))
    joints = float(len(design.joints))

    bins = design.metadata.get("bins", [])
    challenge = design.metadata.get("challenge", {})
    metrics: dict[str, float] = {
        "parts_used": parts_used,
        "joints": joints,
        "distance_m": 0.0,
        "max_distance_m": 0.0,
        "falls": 0.0,
        "stability": 1.0,
        "energy": 0.0,
        "duration_s": 0.0,
        "spread_area": 0.0,
        "bins_count": float(len(bins)),
        "bins_in_target": 0.0,
        "bins_correct": 0.0,
        # 1.0 when at least one bin declares an accepted class (matching intended).
        "bins_matchable": 1.0 if any(b.get("accepts") for b in bins) else 0.0,
        "reached_goal": 0.0,
        "goal_progress": 0.0,
        "crossed_threshold": 0.0,
        "min_spacing": 0.0,
        "avg_spacing": 0.0,
    }

    frames = trace.frames
    if not frames:
        # No simulation data: stability is meaningless, report 0.
        metrics["stability"] = 0.0
        return metrics

    metrics["duration_s"] = float(frames[-1].t)

    end_bodies = frames[-1].bodies

    # --- spread_area + livability spacing of bodies in the final frame ---------
    if len(end_bodies) >= 2:
        xs = [b.x for b in end_bodies.values()]
        ys = [b.y for b in end_bodies.values()]
        metrics["spread_area"] = max(0.0, (max(xs) - min(xs)) * (max(ys) - min(ys)))
        # Nearest-neighbour spacing: a livability proxy (well-spaced > clumped).
        pts = [(b.x, b.y) for b in end_bodies.values()]
        nearest = []
        for i, (xi, yi) in enumerate(pts):
            dists = [math.hypot(xi - xj, yi - yj) for j, (xj, yj) in enumerate(pts) if j != i]
            if dists:
                nearest.append(min(dists))
        if nearest:
            metrics["min_spacing"] = min(nearest)
            metrics["avg_spacing"] = sum(nearest) / len(nearest)

    # --- bins: containment (bins_in_target) + correct class match (bins_correct) -
    if bins:
        colors = {b.id: b.color for b in design.bodies}
        dynamic_ids = set(_dynamic_bodies(design)) or set(end_bodies.keys())
        for bid in dynamic_ids:
            body = end_bodies.get(bid)
            if body is None:
                continue
            for bin_ in bins:
                half_w = bin_["width"] / 2.0
                half_h = bin_["height"] / 2.0
                if abs(body.x - bin_["x"]) <= half_w and abs(body.y - bin_["y"]) <= half_h:
                    metrics["bins_in_target"] += 1.0
                    accepts = bin_.get("accepts")
                    if accepts is not None and colors.get(bid) == accepts:
                        metrics["bins_correct"] += 1.0
                    break  # count each dynamic body at most once

    primary = _primary_body_id(trace, design)
    if primary is None:
        metrics["stability"] = 0.0
        return metrics

    # --- distance / max_distance -------------------------------------------------
    start = frames[0].bodies.get(primary)
    final_x = None
    if start is not None:
        start_x = start.x
        xs = [
            f.bodies[primary].x for f in frames if primary in f.bodies
        ]
        if xs:
            final_x = xs[-1]
            metrics["distance_m"] = abs(xs[-1] - start_x)
            metrics["max_distance_m"] = max(abs(x - start_x) for x in xs)

    # --- goal zone / threshold (Bridge, Crawl) -----------------------------------
    if final_x is not None and start is not None:
        goal_x = challenge.get("goal_x")
        if isinstance(goal_x, (int, float)) and goal_x != start_x:
            progress = (final_x - start_x) / (goal_x - start_x)
            metrics["goal_progress"] = _clamp01(progress)
            metrics["reached_goal"] = 1.0 if final_x >= goal_x else 0.0
        threshold_x = challenge.get("threshold_x")
        if isinstance(threshold_x, (int, float)):
            metrics["crossed_threshold"] = 1.0 if final_x >= threshold_x else 0.0

    # --- falls (count fall events, i.e. transitions below threshold) -------------
    falls = 0
    was_fallen = False
    for f in frames:
        body = f.bodies.get(primary)
        if body is None:
            continue
        fallen = body.y < _FALL_Y_THRESHOLD
        if fallen and not was_fallen:
            falls += 1
        was_fallen = fallen
    metrics["falls"] = float(falls)

    # --- stability (1 - normalized angle oscillation) ----------------------------
    angles = [f.bodies[primary].angle for f in frames if primary in f.bodies]
    if len(angles) >= 2:
        mean = sum(angles) / len(angles)
        variance = sum((a - mean) ** 2 for a in angles) / len(angles)
        # Normalize: a variance of ~1 rad^2 already means very wobbly.
        metrics["stability"] = _clamp01(1.0 - variance)
    else:
        # Fewer than 2 recorded frames means nothing meaningful simulated, so a
        # "perfect 1.0" would falsely credit a degenerate design. Report 0.0,
        # consistent with the no-frames branch above.
        metrics["stability"] = 0.0

    # --- energy proxy: summed per-frame path length of all dynamic bodies --------
    dynamic_ids = _dynamic_bodies(design)
    if not dynamic_ids:
        dynamic_ids = list(frames[0].bodies.keys())
    energy = 0.0
    for prev, cur in zip(frames, frames[1:], strict=False):
        for bid in dynamic_ids:
            pb = prev.bodies.get(bid)
            cb = cur.bodies.get(bid)
            if pb is None or cb is None:
                continue
            energy += abs(cb.x - pb.x) + abs(cb.y - pb.y)
    metrics["energy"] = energy

    return metrics


# --- reward functions ----------------------------------------------------------
# Each maps a metrics dict to (score_total, success, summary).
def _reward_distance_plus_stability(m: dict[str, float]) -> tuple[float, bool, str]:
    distance = m.get("distance_m", 0.0)
    stability = m.get("stability", 0.0)
    falls = m.get("falls", 0.0)
    score = distance * 10.0 + stability * 20.0 - falls * 5.0
    success = distance >= 3.0 and falls == 0
    summary = (
        f"Travelled {distance:.2f}m with stability {stability:.2f} "
        f"and {int(falls)} fall(s)."
    )
    return score, success, summary


def _reward_bridge_transport(m: dict[str, float]) -> tuple[float, bool, str]:
    """Bridge: carry the crate to the goal zone, stay standing, stay lean.

    Rewards goal progress and reaching the goal, plus stability; penalizes
    collapses and excessive parts (a bridge should be efficient).
    """
    progress = m.get("goal_progress", 0.0)
    reached = m.get("reached_goal", 0.0)
    stability = m.get("stability", 0.0)
    falls = m.get("falls", 0.0)
    parts = m.get("parts_used", 0.0)
    part_penalty = max(0.0, parts - 12.0) * 2.0
    score = progress * 50.0 + reached * 30.0 + stability * 10.0 - falls * 10.0 - part_penalty
    success = reached >= 1.0 and falls == 0
    summary = (
        f"{'Reached goal' if reached else f'{progress:.0%} to goal'}; "
        f"stability {stability:.2f}, {int(falls)} fall(s), {int(parts)} parts."
    )
    return score, success, summary


def _reward_crawl_locomotion(m: dict[str, float]) -> tuple[float, bool, str]:
    """Crawl: move the body forward and cross the threshold.

    Pure locomotion — rewards net forward travel and crossing the line, with a
    fall penalty. No part bonus (unlike a city), so it favours motion over bulk.
    """
    distance = m.get("distance_m", 0.0)
    crossed = m.get("crossed_threshold", 0.0)
    falls = m.get("falls", 0.0)
    score = distance * 12.0 + crossed * 25.0 - falls * 8.0
    success = crossed >= 1.0
    summary = (
        f"Crawled {distance:.2f}m"
        f"{' — crossed the line' if crossed else ''}; {int(falls)} fall(s)."
    )
    return score, success, summary


def _reward_sorting_accuracy(m: dict[str, float]) -> tuple[float, bool, str]:
    bins_count = m.get("bins_count", 0.0)
    bins_in_target = m.get("bins_in_target", 0.0)
    bins_correct = m.get("bins_correct", 0.0)
    stability = m.get("stability", 0.0)
    dynamic = max(m.get("parts_used", 0.0) - bins_count, 0.0)

    if bins_count <= 0 or dynamic <= 0:
        return (
            stability * 30.0,
            False,
            f"No bins placed — cannot score sorting. Stability proxy: {stability:.2f}.",
        )

    # True object-class-to-bin matching when bins declare an accepted class;
    # otherwise fall back to plain containment.
    if m.get("bins_matchable", 0.0) > 0:
        accuracy = bins_correct / dynamic
        score = accuracy * 90.0 + stability * 10.0
        success = accuracy >= 0.5
        summary = (
            f"Correctly sorted {int(bins_correct)}/{int(dynamic)} items into the "
            f"matching bin ({accuracy:.0%}); {int(bins_in_target)} landed in any bin."
        )
    else:
        accuracy = bins_in_target / dynamic
        score = accuracy * 70.0 + stability * 20.0
        success = accuracy >= 0.5
        summary = (
            f"{int(bins_in_target)}/{int(dynamic)} items landed in a bin "
            f"({accuracy:.0%} containment, stability {stability:.2f})."
        )
    return score, success, summary


def _reward_city_score(m: dict[str, float]) -> tuple[float, bool, str]:
    """Tiny City: more structures, well spread and well spaced (livable), stable."""
    parts = m.get("parts_used", 0.0)
    spread_area = m.get("spread_area", 0.0)
    avg_spacing = m.get("avg_spacing", 0.0)
    min_spacing = m.get("min_spacing", 0.0)
    stability = m.get("stability", 0.0)
    score = (
        parts * 4.0
        + math.sqrt(max(0.0, spread_area)) * 2.0
        + avg_spacing * 4.0  # livability: well-spaced beats clumped
        + stability * 8.0
    )
    success = parts >= 4 and min_spacing >= 1.0
    summary = (
        f"City: {int(parts)} structures, {spread_area:.1f}u² spread, "
        f"avg spacing {avg_spacing:.2f} (min {min_spacing:.2f})."
    )
    return score, success, summary


def _reward_default(m: dict[str, float]) -> tuple[float, bool, str]:
    distance = m.get("distance_m", 0.0)
    score = distance * 10.0
    success = distance >= 2.0
    summary = f"Default reward: travelled {distance:.2f}m."
    return score, success, summary


REWARDS: dict[str, Callable[[dict[str, float]], tuple[float, bool, str]]] = {
    "distance_plus_stability": _reward_distance_plus_stability,
    "bridge_transport": _reward_bridge_transport,
    "crawl_locomotion": _reward_crawl_locomotion,
    "sorting_accuracy": _reward_sorting_accuracy,
    "city_score": _reward_city_score,
    "default": _reward_default,
}


# Reference distance below which a stable design is considered "short" for the
# improvement hint. Matches the distance success threshold used by the rewards.
_SHORT_DISTANCE_TARGET = 3.0


def _improvement_hint(metrics: dict[str, float]) -> str:
    """Short, deterministic "why it failed / how to improve" derived from metrics."""
    parts = metrics.get("parts_used", 0.0)
    falls = metrics.get("falls", 0.0)
    distance = metrics.get("distance_m", 0.0)
    if parts == 0:
        return "Design was empty — add bodies before simulating."
    if falls > 0:
        return (
            f"Structure fell {int(falls)}x — add support or lower the "
            "center of mass."
        )
    if distance < _SHORT_DISTANCE_TARGET:
        return "Stable but short — add propulsion or extend reach."
    return "Solid attempt — iterate on the best design."


def score_attempt(
    trace: EpisodeTrace | None, design: DesignSpec, reward: str
) -> ScoreCard:
    """Compute metrics and apply the named reward to produce a ScoreCard.

    Unknown reward names fall back to ``default`` (but the ScoreCard records
    ``reward="default"`` so callers can tell). A ``None`` trace yields a zero
    ScoreCard.
    """
    if trace is None:
        no_trace_metrics = {
            "parts_used": float(len(design.bodies)),
            "bins_count": float(len(design.metadata.get("bins", []))),
            "bins_in_target": 0.0,
            "spread_area": 0.0,
        }
        return ScoreCard(
            score_total=0.0,
            success=False,
            metrics=no_trace_metrics,
            failure_events=(
                [{"type": "empty_design"}] if not design.bodies else []
            ),
            summary="No simulation was run (empty design).",
            reward=reward if reward in REWARDS else "default",
            improvement_hint=_improvement_hint(no_trace_metrics),
        )

    metrics = compute_metrics(trace, design)

    reward_name = reward if reward in REWARDS else "default"
    reward_fn = REWARDS[reward_name]
    score_total, success, summary = reward_fn(metrics)

    failure_events: list[dict] = []
    if metrics.get("falls", 0.0) > 0:
        failure_events.append({"type": "fall", "count": int(metrics["falls"])})
    if metrics.get("parts_used", 0.0) == 0:
        failure_events.append({"type": "empty_design"})

    return ScoreCard(
        score_total=score_total,
        success=success,
        metrics=metrics,
        failure_events=failure_events,
        summary=summary,
        reward=reward_name,
        improvement_hint=_improvement_hint(metrics),
    )
