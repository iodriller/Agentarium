import type {
  EmbodimentDevice,
  EmbodimentObservation,
} from '../../api/types'

interface PhysicalWorkspaceMapProps {
  device: EmbodimentDevice
  observation: EmbodimentObservation | null
  trail: EmbodimentObservation[]
  target: { x: number; y: number }
}

const VIEW_W = 1000
const VIEW_H = 600
const PAD = 54

function numberSensor(
  observation: EmbodimentObservation | null,
  key: string,
): number | null {
  const value = observation?.sensors[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function PhysicalWorkspaceMap({
  device,
  observation,
  trail,
  target,
}: PhysicalWorkspaceMapProps) {
  const { limits } = device
  const width = Math.max(0.001, limits.max_x - limits.min_x)
  const height = Math.max(0.001, limits.max_y - limits.min_y)
  const plotW = VIEW_W - PAD * 2
  const plotH = VIEW_H - PAD * 2
  const point = (x: number, y: number) => ({
    x: PAD + ((x - limits.min_x) / width) * plotW,
    y: PAD + (1 - (y - limits.min_y) / height) * plotH,
  })
  const pose = observation?.pose ?? { x: 0, y: 0, heading_rad: 0 }
  const rover = point(pose.x, pose.y)
  const goal = point(target.x, target.y)
  const headingDeg = (-pose.heading_rad * 180) / Math.PI
  const frontRange = numberSensor(observation, 'front_range_m')
  const uncertainty = numberSensor(observation, 'localization_uncertainty_m') ?? 0.03
  const rangePixels = frontRange == null
    ? 0
    : Math.min(frontRange, Math.hypot(width, height)) * Math.min(plotW / width, plotH / height)
  const coneLength = Math.min(rangePixels, Math.max(plotW, plotH) * 0.58)
  const uncertaintyPixels = uncertainty * Math.min(plotW / width, plotH / height)
  const trailPoints = trail
    .map((item) => point(item.pose.x, item.pose.y))
    .map((item) => `${item.x},${item.y}`)
    .join(' ')
  const safetyColor =
    device.safety_state === 'armed'
      ? '#34d399'
      : device.safety_state === 'emergency_stopped'
        ? '#fb7185'
        : '#94a3b8'
  const battery = observation?.battery_fraction

  return (
    <div
      style={{
        position: 'relative',
        minHeight: 340,
        overflow: 'hidden',
        border: `2px solid ${safetyColor}`,
        borderRadius: 10,
        background:
          'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--surface-2) 75%, #14304a), var(--surface-2) 72%)',
      }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`Calibrated workspace for ${device.label}`}
        style={{ display: 'block', width: '100%', height: 340 }}
      >
        <defs>
          <pattern id="physical-minor-grid" width="45" height="45" patternUnits="userSpaceOnUse">
            <path d="M 45 0 L 0 0 0 45" fill="none" stroke="#526071" strokeOpacity="0.18" strokeWidth="1" />
          </pattern>
          <pattern id="physical-major-grid" width="225" height="225" patternUnits="userSpaceOnUse">
            <rect width="225" height="225" fill="url(#physical-minor-grid)" />
            <path d="M 225 0 L 0 0 0 225" fill="none" stroke="#7b8da3" strokeOpacity="0.28" strokeWidth="1.6" />
          </pattern>
          <linearGradient id="sensor-cone" x1="0" x2="1">
            <stop offset="0" stopColor="#67e8f9" stopOpacity="0.28" />
            <stop offset="1" stopColor="#67e8f9" stopOpacity="0.02" />
          </linearGradient>
          <filter id="rover-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x={PAD} y={PAD} width={plotW} height={plotH} rx="8" fill="url(#physical-major-grid)" />
        <rect
          x={PAD}
          y={PAD}
          width={plotW}
          height={plotH}
          rx="8"
          fill="none"
          stroke={safetyColor}
          strokeOpacity="0.9"
          strokeWidth="3"
          strokeDasharray={device.safety_state === 'armed' ? undefined : '10 7'}
        />

        {limits.min_x <= 0 && limits.max_x >= 0 && (
          <line
            x1={point(0, limits.min_y).x}
            y1={PAD}
            x2={point(0, limits.min_y).x}
            y2={PAD + plotH}
            stroke="#a9b7c8"
            strokeOpacity="0.38"
            strokeWidth="2"
          />
        )}
        {limits.min_y <= 0 && limits.max_y >= 0 && (
          <line
            x1={PAD}
            y1={point(limits.min_x, 0).y}
            x2={PAD + plotW}
            y2={point(limits.min_x, 0).y}
            stroke="#a9b7c8"
            strokeOpacity="0.38"
            strokeWidth="2"
          />
        )}

        <line
          x1={rover.x}
          y1={rover.y}
          x2={goal.x}
          y2={goal.y}
          stroke="#f6c85f"
          strokeOpacity="0.55"
          strokeWidth="3"
          strokeDasharray="10 8"
        />
        {trailPoints && (
          <polyline
            points={trailPoints}
            fill="none"
            stroke="#a78bfa"
            strokeOpacity="0.75"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        <g transform={`translate(${goal.x} ${goal.y})`}>
          <circle r="19" fill="#f6c85f" fillOpacity="0.12" stroke="#f6c85f" strokeWidth="3" />
          <circle r="6" fill="#f6c85f" />
          <line x1="-27" y1="0" x2="27" y2="0" stroke="#f6c85f" strokeWidth="2" />
          <line x1="0" y1="-27" x2="0" y2="27" stroke="#f6c85f" strokeWidth="2" />
          <text x="25" y="-20" fill="#f6c85f" fontSize="18" fontFamily="monospace">TARGET</text>
        </g>

        {uncertaintyPixels > 0 && (
          <circle
            cx={rover.x}
            cy={rover.y}
            r={Math.max(8, uncertaintyPixels)}
            fill="#67e8f9"
            fillOpacity="0.06"
            stroke="#67e8f9"
            strokeOpacity="0.35"
            strokeWidth="2"
            strokeDasharray="5 5"
          />
        )}

        <g transform={`translate(${rover.x} ${rover.y}) rotate(${headingDeg})`}>
          {coneLength > 0 && (
            <path
              d={`M 18 0 L ${18 + coneLength} ${-coneLength * 0.28} L ${18 + coneLength} ${coneLength * 0.28} Z`}
              fill="url(#sensor-cone)"
              stroke="#67e8f9"
              strokeOpacity="0.3"
              strokeWidth="2"
            />
          )}
          <g filter="url(#rover-glow)">
            <rect x="-25" y="-20" width="50" height="40" rx="9" fill="#8b5cf6" stroke="#f5f3ff" strokeWidth="3" />
            <rect x="-31" y="-17" width="8" height="14" rx="3" fill="#252d3a" />
            <rect x="-31" y="3" width="8" height="14" rx="3" fill="#252d3a" />
            <rect x="23" y="-17" width="8" height="14" rx="3" fill="#252d3a" />
            <rect x="23" y="3" width="8" height="14" rx="3" fill="#252d3a" />
            <circle cx="7" cy="0" r="7" fill="#67e8f9" />
            <path d="M 16 -9 L 33 0 L 16 9 Z" fill="#f8fafc" />
          </g>
        </g>

        <g fill="#9aa8ba" fontSize="16" fontFamily="monospace">
          <text x={PAD} y={PAD - 16}>{limits.max_y.toFixed(1)}m</text>
          <text x={PAD} y={PAD + plotH + 30}>{limits.min_y.toFixed(1)}m</text>
          <text x={PAD} y={PAD + plotH + 48}>{limits.min_x.toFixed(1)}m</text>
          <text x={PAD + plotW - 48} y={PAD + plotH + 48}>{limits.max_x.toFixed(1)}m</text>
        </g>
      </svg>

      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 12,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        <MapBadge label="STATE" value={device.safety_state.replaceAll('_', ' ')} color={safetyColor} />
        <MapBadge
          label="SPEED"
          value={`${(observation?.velocity.linear_mps ?? 0).toFixed(2)} m/s`}
          color="#67e8f9"
        />
        <MapBadge
          label="RANGE"
          value={frontRange == null ? '—' : `${frontRange.toFixed(2)} m`}
          color="#67e8f9"
        />
        <MapBadge
          label="BATTERY"
          value={battery == null ? '—' : `${Math.round(battery * 100)}%`}
          color={battery != null && battery < 0.2 ? '#fb7185' : '#34d399'}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 10,
          padding: '5px 8px',
          borderRadius: 5,
          background: '#08111dcc',
          color: 'var(--text-2)',
          fontFamily: 'monospace',
          fontSize: 10,
        }}
      >
        POSE ({pose.x.toFixed(3)}, {pose.y.toFixed(3)}) · HDG{' '}
        {((pose.heading_rad * 180) / Math.PI).toFixed(1)}°
      </div>
    </div>
  )
}

function MapBadge({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        gap: 5,
        padding: '4px 7px',
        borderRadius: 5,
        border: `1px solid color-mix(in srgb, ${color} 55%, transparent)`,
        background: '#08111dd9',
        color: '#dbe8f5',
        fontFamily: 'monospace',
        fontSize: 9,
        textTransform: 'uppercase',
      }}
    >
      <strong style={{ color }}>{label}</strong>
      {value}
    </span>
  )
}
