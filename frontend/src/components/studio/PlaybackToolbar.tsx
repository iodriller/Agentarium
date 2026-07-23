interface PlaybackToolbarProps {
  playing: boolean
  onTogglePlay: () => void
  onStop: () => void
  speed: number
  onSpeedChange: (speed: number) => void
  frameIndex: number
  totalFrames: number
  onFullscreen?: () => void
  cameraLabel?: string
}

export function PlaybackToolbar({
  playing,
  onTogglePlay,
  onStop,
  speed,
  onSpeedChange,
  frameIndex,
  totalFrames,
  onFullscreen,
  cameraLabel = 'Side View',
}: PlaybackToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-1)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          color: 'var(--text-2)',
        }}
      >
        Camera
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-1)' }}>{cameraLabel}</span>

      <span
        style={{
          fontSize: 11,
          color: 'var(--text-2)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        Step {frameIndex}
        {totalFrames > 0 ? ` / ${totalFrames - 1}` : ''}
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Sim speed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Sim Speed</span>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.25}
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            style={{ width: 110, accentColor: 'var(--accent)' }}
          />
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-1)',
              width: 36,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {speed.toFixed(2)}x
          </span>
        </div>

        <button
          onClick={onTogglePlay}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {playing ? '❚❚ Pause' : '► Play'}
        </button>

        <button
          onClick={onStop}
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid var(--danger)',
            background: 'transparent',
            color: 'var(--danger)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ■ Stop
        </button>

        <button
          title="Fullscreen"
          onClick={onFullscreen}
          disabled={!onFullscreen}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text-1)',
            fontSize: 13,
            cursor: onFullscreen ? 'pointer' : 'not-allowed',
          }}
        >
          ⛶
        </button>
      </div>
    </div>
  )
}
