export function trlColor(trl: number): string {
  return `hsl(${30 + (trl / 9) * 100}, 75%, 50%)`
}

interface TrlBarProps { trl: number }

const TRL_LABELS: Record<number, string> = {
  1: 'Basic principles observed',
  2: 'Technology concept formulated',
  3: 'Experimental proof of concept',
  4: 'Technology validated in lab',
  5: 'Technology validated (relevant env)',
  6: 'Technology demonstrated (relevant env)',
  7: 'System prototype demonstration',
  8: 'System complete and qualified',
  9: 'Actual system proven in operation',
}

export function TrlBar({ trl }: TrlBarProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#e67e22' }}>TRL {trl} / 9</span>
        <span style={{ fontSize: 10, color: '#888' }}>{TRL_LABELS[trl]}</span>
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: 9 }, (_, i) => {
          const level = i + 1
          const filled = level <= trl
          return (
            <div
              key={level}
              title={`TRL ${level}: ${TRL_LABELS[level]}`}
              style={{
                flex: 1,
                height: 8,
                borderRadius: 2,
                background: filled ? trlColor(trl) : '#2a2a4a',
                transition: 'background 0.2s',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
