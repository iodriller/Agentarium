import type { ModelInteraction } from '../../api/types'

export function ModelInspector({ interactions }: { interactions: ModelInteraction[] }) {
  const totals = interactions.reduce(
    (sum, interaction) => ({
      input: sum.input + interaction.result.usage.input_tokens,
      output: sum.output + interaction.result.usage.output_tokens,
      latency: sum.latency + interaction.result.latency_ms,
    }),
    { input: 0, output: 0, latency: 0 },
  )

  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--surface-1)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '9px 11px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)' }}>
          Model Inspector
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>
          {interactions.length
            ? `${interactions.length} turn${interactions.length === 1 ? '' : 's'} · ${totals.input + totals.output} tokens · ${totals.latency.toFixed(0)}ms`
            : 'No persisted model telemetry for this trace.'}
        </div>
      </div>
      {interactions.map((interaction) => (
        <details
          key={`${interaction.agent_id}-${interaction.turn_index}`}
          style={{ borderBottom: '1px solid var(--border)', padding: '7px 10px' }}
        >
          <summary style={{ cursor: 'pointer', fontSize: 10.5, color: 'var(--text-1)' }}>
            Turn {interaction.turn_index + 1} · {interaction.agent_id} ·{' '}
            {interaction.result.model}
          </summary>
          <div style={{ display: 'grid', gap: 7, marginTop: 8, fontSize: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              <Stat label="Provider" value={interaction.result.provider} />
              <Stat
                label="Protocol"
                value={interaction.result.native_tool_calls ? 'native tools' : 'prompt JSON'}
              />
              <Stat
                label="Tokens"
                value={`${interaction.result.usage.input_tokens} in / ${interaction.result.usage.output_tokens} out`}
              />
              <Stat
                label="Latency / retries"
                value={`${interaction.result.latency_ms.toFixed(0)}ms / ${interaction.result.retries}`}
              />
            </div>
            <TextBlock label="User prompt" value={interaction.user} />
            <TextBlock label="Raw model text" value={interaction.result.raw_text || '—'} />
          </div>
        </details>
      ))}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 6, background: 'var(--surface-2)', borderRadius: 5 }}>
      <div style={{ color: 'var(--text-2)' }}>{label}</div>
      <div style={{ overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: 'var(--text-2)', marginBottom: 3 }}>{label}</div>
      <pre
        style={{
          maxHeight: 150,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          padding: 7,
          borderRadius: 5,
          background: 'var(--surface-2)',
          fontFamily: 'monospace',
          fontSize: 9.5,
        }}
      >
        {value}
      </pre>
    </div>
  )
}

