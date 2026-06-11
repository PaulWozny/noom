import { memo } from 'react'
import { useViewport } from '@xyflow/react'
import type { ColumnBounds } from './layout'

interface ColumnHeadersProps {
  columns: ColumnBounds[]
  nodeCounts: Map<string | null, number>
  onOpenPhaseManager: () => void
}

// Sticky phase headers: rendered OUTSIDE the React Flow transform (sibling
// overlay in .graph-container) and synced horizontally to the viewport via
// useViewport — they track pan/zoom on x but stay pinned to the top.
export const ColumnHeaders = memo(function ColumnHeaders({
  columns, nodeCounts, onOpenPhaseManager,
}: ColumnHeadersProps) {
  const { x, zoom } = useViewport()
  if (columns.length === 0) return null
  return (
    <div className="column-headers" style={{ pointerEvents: 'none' }}>
      {columns.map(col => {
        const screenX = col.x * zoom + x
        const screenW = col.width * zoom
        if (screenW < 24) return null
        const count = nodeCounts.get(col.phaseId) ?? 0
        return (
          <button
            key={col.phaseId ?? '__unassigned'}
            className="column-header-chip"
            style={{
              left: screenX,
              width: screenW,
              pointerEvents: 'auto',
              ['--phase-accent' as string]: col.color ?? 'var(--column-band-base)',
            }}
            title={`${col.name} — ${count} node${count === 1 ? '' : 's'}. Click to manage phases.`}
            onClick={onOpenPhaseManager}
          >
            {screenW >= 60 && (
              <>
                <span className="column-header-name">{col.name}</span>
                <span className="column-header-count">{count}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
})
