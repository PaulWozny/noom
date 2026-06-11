import type { ProbabilityLevel, ImpactLevel } from '@/types'

const LEVELS: ProbabilityLevel[] = ['low', 'medium', 'high']

const CELL_COLORS: Record<string, string> = {
  'low-low':      '#1a5c1a',
  'low-medium':   '#4d6b1a',
  'low-high':     '#7a5c00',
  'medium-low':   '#4d6b1a',
  'medium-medium':'#8a5c00',
  'medium-high':  '#8a2500',
  'high-low':     '#7a5c00',
  'high-medium':  '#8a2500',
  'high-high':    '#6b0000',
}

export interface RiskEntry {
  label: string
  probability: ProbabilityLevel | null
  impact: ImpactLevel | null
}

// Marks the cell of every risk attachment on the node (critical shown as high).
export function RiskMatrix({ risks }: { risks: RiskEntry[] }) {
  const placed = risks.filter(r => r.probability != null && r.impact != null)
  if (placed.length === 0) return null
  const cellRisks = new Map<string, string[]>()
  for (const r of placed) {
    const imp = r.impact === 'critical' ? 'high' : r.impact
    const key = `${r.probability}-${imp}`
    if (!cellRisks.has(key)) cellRisks.set(key, [])
    cellRisks.get(key)!.push(r.label)
  }
  const hasCritical = placed.some(r => r.impact === 'critical')

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Risk Matrix
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 1fr 1fr', gap: 2, fontSize: 9 }}>
        {/* header row: impact on X */}
        <div />
        {LEVELS.map(l => (
          <div key={l} style={{ color: '#666', textAlign: 'center', paddingBottom: 2 }}>{l}</div>
        ))}
        {/* data rows: probability on Y */}
        {[...LEVELS].reverse().map(prob => (
          <div key={`row-${prob}`} style={{ display: 'contents' }}>
            <div style={{ color: '#666', display: 'flex', alignItems: 'center' }}>{prob}</div>
            {LEVELS.map(imp => {
              const key = `${prob}-${imp}`
              const labels = cellRisks.get(key)
              return (
                <div
                  key={key}
                  title={labels?.join(', ')}
                  style={{
                    height: 28,
                    borderRadius: 3,
                    background: CELL_COLORS[key] ?? '#1a1a3a',
                    border: labels ? '2px solid #fff' : '1px solid #ffffff11',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                  }}
                >
                  {labels ? (labels.length > 1 ? `★×${labels.length}` : '★') : ''}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {hasCritical && (
        <div style={{ fontSize: 9, color: '#c95f6d', marginTop: 4 }}>Impact rated critical (shown as high)</div>
      )}
    </div>
  )
}
