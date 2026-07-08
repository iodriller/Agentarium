from __future__ import annotations

import math

import pymunk

from agentarium.core.schemas.design import BodyShape, BodySpec, DesignSpec, JointSpec, JointType
from agentarium.core.schemas.setup import WorldConfig

# Identifier used for the auto-generated static ground segment.
GROUND_ID = "__ground__"

# Pymunk requires dynamic bodies to have mass > 0 and moment > 0, and degenerate
# (zero-size) shapes either raise or produce NaN once stepped. Agent tool args are
# untrusted, so clamp mass and every dimension to small positive minimums before
# they reach pymunk. This keeps a pathological design (mass 0, radius 0, zero-size
# box) from crashing the whole run.
_MIN_MASS = 1e-3
_MIN_DIM = 1e-2


def _make_shape(body: pymunk.Body, spec: BodySpec) -> pymunk.Shape:
    """Create the pymunk shape matching a BodySpec, attached to ``body``."""
    size = spec.size or [0.5, 0.5]
    if spec.shape == BodyShape.circle:
        radius = max(size[0] if size else 0.5, _MIN_DIM)
        shape: pymunk.Shape = pymunk.Circle(body, radius)
    elif spec.shape == BodyShape.segment:
        length = max(size[0] if size else 1.0, _MIN_DIM)
        half = length / 2.0
        shape = pymunk.Segment(body, (-half, 0.0), (half, 0.0), radius=0.05)
    elif spec.shape == BodyShape.polygon:
        # Treat ``size`` as a flat list of x,y vertex pairs when provided,
        # otherwise fall back to a box from the first two values.
        if len(size) >= 6 and len(size) % 2 == 0:
            verts = [(size[i], size[i + 1]) for i in range(0, len(size), 2)]
            shape = pymunk.Poly(body, verts)
        else:
            w = max(size[0] if len(size) > 0 else 0.5, _MIN_DIM)
            h = max(size[1] if len(size) > 1 else 0.5, _MIN_DIM)
            shape = pymunk.Poly.create_box(body, (w, h))
    else:  # box (default)
        w = max(size[0] if len(size) > 0 else 0.5, _MIN_DIM)
        h = max(size[1] if len(size) > 1 else 0.5, _MIN_DIM)
        shape = pymunk.Poly.create_box(body, (w, h))
    shape.friction = spec.friction
    shape.elasticity = spec.elasticity
    shape.sensor = spec.sensor
    return shape


def _moment(spec: BodySpec) -> float:
    size = spec.size or [0.5, 0.5]
    mass = max(spec.mass, _MIN_MASS)
    if spec.shape == BodyShape.circle:
        radius = max(size[0] if size else 0.5, _MIN_DIM)
        return pymunk.moment_for_circle(mass, 0.0, radius)
    if spec.shape == BodyShape.segment:
        length = max(size[0] if size else 1.0, _MIN_DIM)
        half = length / 2.0
        return pymunk.moment_for_segment(mass, (-half, 0.0), (half, 0.0), 0.05)
    w = max(size[0] if len(size) > 0 else 0.5, _MIN_DIM)
    h = max(size[1] if len(size) > 1 else 0.5, _MIN_DIM)
    return pymunk.moment_for_box(mass, (w, h))


def _make_body(spec: BodySpec) -> pymunk.Body:
    if spec.static:
        body = pymunk.Body(body_type=pymunk.Body.STATIC)
    else:
        # Clamp mass/moment to positive minimums (see _MIN_MASS): pymunk asserts
        # dynamic bodies have mass > 0 and moment > 0, and agent args are untrusted.
        body = pymunk.Body(max(spec.mass, _MIN_MASS), max(_moment(spec), _MIN_MASS))
    # Defensive: a malformed position (wrong length / non-finite) must not crash.
    px = spec.position[0] if len(spec.position) > 0 else 0.0
    py = spec.position[1] if len(spec.position) > 1 else 0.0
    px = px if math.isfinite(px) else 0.0
    py = py if math.isfinite(py) else 0.0
    body.position = (px, py)
    # Orientation (radians) — lets a segment be a sloped ramp/beam, not a flat bar.
    angle = spec.angle if math.isfinite(spec.angle) else 0.0
    body.angle = angle
    return body


def _add_joint(
    space: pymunk.Space,
    bodies: dict[str, pymunk.Body],
    joint: JointSpec,
) -> None:
    a = bodies.get(joint.body_a)
    b = bodies.get(joint.body_b)
    if a is None or b is None:
        return
    # pymunk requires at least one DYNAMIC body in a constraint; a joint between
    # two static bodies raises and would crash the whole simulation. Skip it.
    if a.body_type == pymunk.Body.STATIC and b.body_type == pymunk.Body.STATIC:
        return
    anchor_a = (joint.anchor_a[0], joint.anchor_a[1])
    anchor_b = (joint.anchor_b[0], joint.anchor_b[1])

    if joint.type == JointType.pin:
        constraint: pymunk.Constraint = pymunk.PinJoint(a, b, anchor_a, anchor_b)
    elif joint.type == JointType.slide:
        constraint = pymunk.SlideJoint(a, b, anchor_a, anchor_b, min=0.0, max=2.0)
    elif joint.type == JointType.spring:
        constraint = pymunk.DampedSpring(
            a, b, anchor_a, anchor_b, rest_length=1.0, stiffness=100.0, damping=5.0
        )
    else:  # pivot (default)
        # Pivot at body_a's world anchor point.
        pivot_point = a.local_to_world(anchor_a)
        constraint = pymunk.PivotJoint(a, b, pivot_point)
    space.add(constraint)

    if joint.motor_rate is not None:
        motor = pymunk.SimpleMotor(a, b, joint.motor_rate)
        motor.max_force = joint.motor_max_force
        space.add(motor)


def build_space(
    design: DesignSpec, world: WorldConfig
) -> tuple[pymunk.Space, dict[str, pymunk.Body]]:
    """Construct a pymunk Space from a DesignSpec + WorldConfig.

    Returns the space and a mapping of body id -> pymunk.Body.
    """
    space = pymunk.Space()
    # A set_gravity tool call records an override on the design; honor it.
    gravity_y = design.metadata.get("gravity_override", world.gravity)
    try:
        gravity_y = float(gravity_y)
    except (TypeError, ValueError):
        gravity_y = world.gravity
    space.gravity = (0.0, gravity_y)

    bodies: dict[str, pymunk.Body] = {}

    # Ground: one segment per span near y=0. ``ground_spans`` on the design
    # metadata (seeded from the world template) lets a world carve a real
    # gap/chasm; a body positioned between spans has no floor beneath it.
    # Default (no spans recorded) is the original single full-width floor.
    map_width = world.map_size[0] if world.map_size else 32
    ground = space.static_body
    spans = design.metadata.get("ground_spans") or [[-float(map_width), float(map_width)]]
    for span in spans:
        if not isinstance(span, (list, tuple)) or len(span) < 2:
            continue
        x0, x1 = float(span[0]), float(span[1])
        if x1 <= x0:
            continue
        ground_segment = pymunk.Segment(ground, (x0, 0.0), (x1, 0.0), radius=0.1)
        ground_segment.friction = 0.9
        ground_segment.elasticity = 0.1
        space.add(ground_segment)

    for spec in design.bodies:
        body = _make_body(spec)
        shape = _make_shape(body, spec)
        space.add(body, shape)
        bodies[spec.id] = body

    for joint in design.joints:
        _add_joint(space, bodies, joint)

    return space, bodies
