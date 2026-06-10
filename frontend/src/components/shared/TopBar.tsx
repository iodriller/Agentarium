interface TopBarProps {
  projectName?: string
}

export function TopBar({ projectName = 'Agentarium' }: TopBarProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        height: 44,
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {/* Left: wordmark + project */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>
          Agentarium
        </span>
        {projectName !== 'Agentarium' && (
          <>
            <span style={{ color: 'var(--border)' }}>›</span>
            <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{projectName}</span>
          </>
        )}
      </div>

      {/* Right: status + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 11, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} />
          System Online
        </span>
        <a href="#" style={{ color: 'var(--text-2)', fontSize: 12, textDecoration: 'none' }}>Docs</a>
        <a href="#" style={{ color: 'var(--text-2)', fontSize: 12, textDecoration: 'none' }}>Help</a>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: 'var(--accent)',
            fontWeight: 600,
          }}
        >
          AD
        </div>
      </div>
    </header>
  )
}
