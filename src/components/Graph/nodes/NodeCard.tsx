import { memo, useState } from 'react'
import { Handle, Position, NodeToolbar, useReactFlow, type NodeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuSeparator,
} from '@/components/ui/context-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { NODE_COLORS, READINESS_COLORS } from '@/types'
import type { VaultNodeData, HandlePos, ReadinessState, AttachmentKind } from '@/types'
import { NODE_ICONS, NODE_TYPE_LABELS, ATTACHMENT_ICONS, READINESS_META } from '@/theme'
import { Tip } from '@/components/Tip'
import { useStore } from '@/store'

function TrlMini({ trl, readiness }: { trl: number; readiness: ReadinessState | undefined }) {
  const pct = ((trl - 1) / 8) * 100
  const accent = readiness === 'in-progress'
    ? READINESS_COLORS['in-progress']
    : 'var(--trl-fill)'
  return (
    <Tip label={`Technology Readiness Level ${trl} of 9`}>
      <div style={{ marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, opacity: 0.7, marginBottom: 2 }}>
          <span>TRL</span><span>{trl}/9</span>
        </div>
        <div style={{ height: 3, borderRadius: 2, background: 'var(--trl-track)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: accent }} />
        </div>
      </div>
    </Tip>
  )
}

function AttachmentBadges({ data }: { data: VaultNodeData }) {
  if (data.attachments.length === 0) return null
  const counts = new Map<AttachmentKind, number>()
  for (const a of data.attachments) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1)
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 5, opacity: 0.75 }}>
      {[...counts.entries()].map(([kind, count]) => {
        const Icon = ATTACHMENT_ICONS[kind]
        const labels = data.attachments.filter(a => a.kind === kind).map(a => a.label).join(', ')
        return (
          <Tip key={kind} label={`${count} ${kind}${count > 1 ? 's' : ''}: ${labels}`}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9, color: 'var(--node-text-subtle)' }}>
              <Icon style={{ width: 10, height: 10 }} /> {count}
            </span>
          </Tip>
        )
      })}
    </div>
  )
}

export const NodeCard = memo(function NodeCard({ data, selected, id }: NodeProps) {
  const d = data as unknown as VaultNodeData
  const { fitView } = useReactFlow()
  const phases = useStore(s => s.phases)
  const updateNode = useStore(s => s.updateNode)
  const deleteNode = useStore(s => s.deleteNode)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const baseColor = NODE_COLORS[d.type] ?? '#555'
  const readiness = d.readiness
  const meta = readiness ? READINESS_META[readiness] : null
  const StateIcon = meta?.icon
  const TypeIcon = NODE_ICONS[d.type]
  const isPill = d.type === 'asset'

  const opacity = readiness === 'blocked' ? 0.45 : readiness === 'ready' ? 1 : 0.85
  const borderColor = selected ? 'var(--node-selected-border)' : meta?.color ?? '#555'
  const glow = !selected && readiness === 'ready'
    ? `0 0 10px ${READINESS_COLORS.ready}55, 0 0 0 1px ${READINESS_COLORS.ready}33`
    : selected ? `0 0 0 2px ${baseColor}44` : 'none'

  // delete directly when unconnected; confirm when edges would be removed too
  function requestDelete() {
    const edges = useStore.getState().vaultEdges
    const hasEdges = edges.some(e => e.source === id || e.target === id)
    if (hasEdges) setConfirmDelete(true)
    else deleteNode(id)
  }

  const phaseItems = (onPick: (phaseId: string | null) => void, Item: typeof DropdownMenuItem) => (
    <>
      {[...phases].sort((a, b) => a.order - b.order).map(p => (
        <Item key={p.id} className="text-xs" onClick={() => onPick(p.id)}>
          {p.name}{d.phaseId === p.id && <span className="ml-auto">✓</span>}
        </Item>
      ))}
      <Item className="text-xs text-muted-foreground" onClick={() => onPick(null)}>
        — unassigned —{d.phaseId == null && <span className="ml-auto">✓</span>}
      </Item>
    </>
  )

  return (
    <>
    <NodeToolbar isVisible={selected} position={Position.Top} offset={6}>
      <div className="flex gap-1">
        <Tip label="Center the view on this node">
          <Button variant="outline" size="sm" className="nodrag h-6 text-[11px] px-2 gap-1"
            onClick={e => { e.stopPropagation(); fitView({ nodes: [{ id }], padding: 0.4, duration: 300, maxZoom: 1.5 }) }}
          >
            ⊙
          </Button>
        </Tip>
        <DropdownMenu modal={false}>
          <Tip label="Move this node to another phase">
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="nodrag h-6 text-[11px] px-2 gap-1"
                onClick={e => e.stopPropagation()}>
                ⇄ phase
              </Button>
            </DropdownMenuTrigger>
          </Tip>
          <DropdownMenuContent className="bg-card border-border">
            {phaseItems(phaseId => updateNode(id, { phaseId }), DropdownMenuItem)}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tip label="Delete this node (and its connections)">
          <Button variant="outline" size="sm" className="nodrag h-6 text-[11px] px-2 gap-1"
            onClick={e => { e.stopPropagation(); requestDelete() }}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </Tip>
      </div>
    </NodeToolbar>

    {/* Handles live OUTSIDE the card div so they don't block card pointer events.
        Sides come from ELK (requires edges anchor on the opposite side). */}
    {d.targetHandles && d.targetHandles.length > 0
      ? (d.targetHandles as HandlePos[]).map(h => (
          <Handle key={h.id} id={h.id} type="target"
            position={h.side === 'right' ? Position.Right : Position.Left}
            className="node-handle" style={{ top: `${h.yPct * 100}%`, background: baseColor }} />
        ))
      : <Handle type="target" position={Position.Left}
          className="node-handle" style={{ background: baseColor }} />
    }
    {d.sourceHandles && d.sourceHandles.length > 0
      ? (d.sourceHandles as HandlePos[]).map(h => (
          <Handle key={h.id} id={h.id} type="source"
            position={h.side === 'left' ? Position.Left : Position.Right}
            className="node-handle" style={{ top: `${h.yPct * 100}%`, background: baseColor }} />
        ))
      : <Handle type="source" position={Position.Right}
          className="node-handle" style={{ background: baseColor }} />
    }

    <ContextMenu>
      <ContextMenuTrigger asChild>
        {isPill ? (
        // assets are junctions, not work items — a compact pill keeps the
        // visual weight on goals/techs and lets edges meet at small points
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 220,
            background: `color-mix(in srgb, ${baseColor} 22%, var(--surface-card))`,
            border: `1.5px solid ${borderColor}`,
            borderRadius: 999,
            padding: '5px 12px',
            opacity,
            cursor: 'pointer',
            boxShadow: glow,
            transition: 'opacity 0.2s, box-shadow 0.2s',
            userSelect: 'none',
          }}
        >
          <TypeIcon style={{ width: 12, height: 12, color: baseColor, flexShrink: 0 }} />
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--node-text)', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {d.label}
          </span>
          {d.attachments.length > 0 && (
            <Tip label={`${d.attachments.length} attachment${d.attachments.length > 1 ? 's' : ''} — open the node for details`}>
              <span style={{ fontSize: 9, color: 'var(--node-text-subtle)', flexShrink: 0 }}>+{d.attachments.length}</span>
            </Tip>
          )}
          {StateIcon && meta && (
            <Tip label={meta.description}>
              <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                <StateIcon style={{ width: 11, height: 11, color: meta.color }} />
              </span>
            </Tip>
          )}
        </div>
        ) : (
        <div
          style={{
            width: 180,
            background: `color-mix(in srgb, ${baseColor} 18%, var(--surface-card))`,
            border: `2px solid ${borderColor}`,
            borderRadius: 8,
            padding: '8px 10px',
            opacity,
            cursor: 'pointer',
            boxShadow: glow,
            transition: 'opacity 0.2s, box-shadow 0.2s',
            userSelect: 'none',
          }}
        >
          {/* header row: type icon + label, readiness glyph */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
            <TypeIcon style={{ width: 11, height: 11, color: baseColor, flexShrink: 0 }} />
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              color: baseColor,
            }}>
              {NODE_TYPE_LABELS[d.type]}
            </span>
            {StateIcon && meta && (
              <Tip label={meta.description}>
                <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex' }}>
                  <StateIcon style={{ width: 11, height: 11, color: meta.color }} />
                </span>
              </Tip>
            )}
          </div>

          {/* label */}
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--node-text)', lineHeight: 1.3,
            wordBreak: 'break-word',
          }}>
            {d.label}
          </div>

          {d.trl != null && <TrlMini trl={d.trl} readiness={readiness} />}

          <AttachmentBadges data={d} />

          {/* tags — max 2 */}
          {d.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 5 }}>
              {d.tags.slice(0, 2).map(t => (
                <Badge key={t} variant="outline"
                  style={{ fontSize: 9, background: `${baseColor}28`, color: baseColor, borderColor: `${baseColor}44`, lineHeight: 1.4, padding: '0 4px' }}
                  className="rounded-sm text-[9px] h-auto"
                >
                  {t}
                </Badge>
              ))}
              {d.tags.length > 2 && (
                <span style={{ fontSize: 9, color: 'var(--node-text-subtle)' }}>+{d.tags.length - 2}</span>
              )}
            </div>
          )}

        </div>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-card border-border">
        <ContextMenuSub>
          <ContextMenuSubTrigger className="text-xs">Move to phase</ContextMenuSubTrigger>
          <ContextMenuSubContent className="bg-card border-border">
            {phaseItems(phaseId => updateNode(id, { phaseId }), ContextMenuItem)}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem className="text-xs"
          onClick={() => navigator.clipboard.writeText(d.label).catch(() => {})}>
          Copy name
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-xs text-destructive focus:text-destructive" onClick={requestDelete}>
          Delete node
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm">Delete “{d.label}”?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            Its connections will be removed as well. This can be undone with Ctrl+Z.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-7 text-xs">Cancel</AlertDialogCancel>
          <AlertDialogAction className="h-7 text-xs" onClick={() => deleteNode(id)}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
})
