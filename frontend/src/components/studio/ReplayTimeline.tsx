interface ReplayTimelineProps {
  frameIndex: number
  totalFrames: number
  playing: boolean
  onSeek: (frameIndex: number) => void
  onTogglePlay: () => void
  speed: number
}

const THUMB_SECONDS = [0, 15, 30, 45, 60]

export function ReplayTimeline({
  frameIndex,
  totalFrames,
  playing,
  onSeek,
  onTogglePlay,
  speed,
}: ReplayTimelineProps) {
  const max = Math.max(0, totalFrames - 1)

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          marginBottom: 6,
        }}
      >
        Replay Timeline
      </div>

      <div
        style={{
          padding: 10,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Attempt label + speed readout */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-1)', fontWeight: 600 }}>Attempt 001</span>
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-2)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {speed.toFixed(2)}x
          </span>
        </div>

        {/* Scrubber + play/pause */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onTogglePlay}
            title={playing ? 'Pause' : 'Play'}
            style={{
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 12,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            {playing ? '❚❚' : '►'}
          </button>

          <input
            type="range"
            min={0}
            max={max}
            step={1}
            value={Math.min(frameIndex, max)}
            onChange={(e) => onSeek(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />

          <span
            style={{
              fontSize: 10,
              color: 'var(--text-2)',
              fontVariantNumeric: 'tabular-nums',
              width: 64,
              textAlign: 'right',
            }}
          >
            {frameIndex} / {max}
          </span>
        </div>

        {/* Placeholder thumbnail row */}
        <div style={{ display: 'flex', gap: 6 }}>
          {THUMB_SECONDS.map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 4,
                border: '1px dashed var(--border)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                fontSize: 9,
                color: 'var(--text-2)',
                paddingBottom: 2,
              }}
            >
              {s}s
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
