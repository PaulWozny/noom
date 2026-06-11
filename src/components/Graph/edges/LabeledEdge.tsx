import { memo, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { RELATION_COLORS, RELATION_LABELS } from '@/types'
import type { RelationType } from '@/types'
import { useStore } from '@/store'

const RELATIONS = Object.keys(RELATION_COLORS) as RelationType[]
const CORNER_RADIUS = 8

interface Pt { x: number; y: number }

// Orthogonal polyline → SVG path with rounded corners
function orthogonalPath(points: Pt[]): { path: string; label: Pt } {
  let path = `M ${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], cur = points[i], next = points[i + 1]
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y)
    const r = Math.min(CORNER_RADIUS, inLen / 2, outLen / 2)
    const inX = (cur.x - prev.x) / (inLen || 1), inY = (cur.y - prev.y) / (inLen || 1)
    const outX = (next.x - cur.x) / (outLen || 1), outY = (next.y - cur.y) / (outLen || 1)
    path += ` L ${cur.x - inX * r},${cur.y - inY * r}`
    path += ` Q ${cur.x},${cur.y} ${cur.x + outX * r},${cur.y + outY * r}`
  }
  const last = points[points.length - 1]
  path += ` L ${last.x},${last.y}`
  // label at the midpoint of the middle segment
  const mid = Math.floor((points.length - 1) / 2)
  const label = {
    x: (points[mid].x + points[mid + 1].x) / 2,
    y: (points[mid].y + points[mid + 1].y) / 2,
  }
  return { path, label }
}

export const LabeledEdge = memo(function LabeledEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, markerEnd, style, selected,
}: EdgeProps) {
  // mutations go through the central store (see store.ts) — the edge edits
  // itself so the relation popover doesn't have to be drilled through props
  const updateEdge = useStore(s => s.updateEdge)
  const deleteEdge = useStore(s => s.deleteEdge)
  const [menuOpen, setMenuOpen] = useState(false)

  const relation = (data?.relation as RelationType) ?? 'flow'
  const color = RELATION_COLORS[relation] ?? '#666'
  const baseOpacity = typeof style?.opacity === 'number' ? style.opacity : 1
  const opacity = menuOpen ? 0.95 : baseOpacity
  const hovered = (data?.hovered as boolean) ?? false
  const showLabel = (selected ?? false) || hovered || menuOpen

  // ELK's orthogonal route — only trustworthy while its endpoints still match
  // the live handle positions (a node drag moves them); otherwise fall back to
  // a smoothstep from the real handles.
  const points = data?.points as Pt[] | undefined
  const routeFresh = points && points.length >= 2 &&
    Math.abs(points[0].x - sourceX) < 4 && Math.abs(points[0].y - sourceY) < 4 &&
    Math.abs(points[points.length - 1].x - targetX) < 4 && Math.abs(points[points.length - 1].y - targetY) < 4

  let edgePath: string, labelX: number, labelY: number
  if (routeFresh) {
    const r = orthogonalPath(points)
    edgePath = r.path
    labelX = r.label.x
    labelY = r.label.y
  } else {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, targetX, targetY,
      sourcePosition, targetPosition,
      borderRadius: CORNER_RADIUS,
    })
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: relation === 'flow' ? 2 : 1.5,
          strokeDasharray: relation === 'related' ? '5 3' : undefined,
          opacity,
          transition: 'opacity 0.15s',
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button
                className="nodrag nopan edge-label-pill"
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                  color,
                  pointerEvents: 'all',
                  opacity: Math.max(opacity, 0.9),
                }}
                title="Click to change relation"
              >
                {RELATION_LABELS[relation] ?? relation}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="w-44 p-1 bg-card border-border">
              <div className="flex flex-col">
                {RELATIONS.map(rel => (
                  <Button
                    key={rel}
                    variant="ghost"
                    size="sm"
                    className="justify-start text-xs h-7 px-2 gap-2"
                    onClick={() => { updateEdge(id, { relation: rel }); setMenuOpen(false) }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: RELATION_COLORS[rel] }} />
                    {RELATION_LABELS[rel]}
                    {rel === relation && <span className="ml-auto text-muted-foreground">✓</span>}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-xs h-7 px-2 gap-2 text-destructive hover:text-destructive"
                  onClick={() => { deleteEdge(id); setMenuOpen(false) }}
                >
                  <Trash2 className="w-3 h-3" /> delete edge
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
