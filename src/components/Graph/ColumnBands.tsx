import { memo } from 'react'
import { ViewportPortal } from '@xyflow/react'
import type { ColumnBounds } from './layout'

interface ColumnBandsProps {
  columns: ColumnBounds[]
  bandY: { min: number; max: number }
  // phase currently hovered during a node drag — highlighted as drop target
  hoverPhaseId?: string | null | undefined
}

// Phase column backgrounds, rendered in graph coordinate space via
// ViewportPortal so they pan/zoom with the nodes. Pointer-events disabled —
// purely decorative, never intercepts canvas interaction.
export const ColumnBands = memo(function ColumnBands({ columns, bandY, hoverPhaseId }: ColumnBandsProps) {
  if (columns.length === 0) return null
  const height = bandY.max - bandY.min
  return (
    <ViewportPortal>
      {columns.map(col => {
        const tint = col.color ?? 'var(--column-band-base)'
        const hovered = hoverPhaseId !== undefined && hoverPhaseId === col.phaseId
        return (
          <div
            key={col.phaseId ?? '__unassigned'}
            style={{
              position: 'absolute',
              left: col.x,
              top: bandY.min,
              width: col.width,
              height,
              background: hovered
                ? `color-mix(in srgb, ${tint} 14%, transparent)`
                : `color-mix(in srgb, ${tint} 5%, transparent)`,
              borderLeft: '1px dashed var(--column-divider)',
              borderRight: '1px dashed var(--column-divider)',
              borderRadius: 12,
              pointerEvents: 'none',
              zIndex: -1,
              transition: 'background 0.15s',
            }}
          />
        )
      })}
    </ViewportPortal>
  )
})
