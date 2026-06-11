import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NODE_COLORS, RELATION_COLORS, RELATION_LABELS, type NodeType, type StatusType, type RelationType, type Phase } from '@/types'
import { NODE_TYPE_LABELS } from '@/theme'
import type { VaultNodeData } from '@/types'

const NODE_TYPES: NodeType[] = ['goal', 'tech', 'asset']
const STATUS_TYPES: StatusType[] = ['planned', 'active', 'done']
const RELATIONS = Object.keys(RELATION_COLORS) as RelationType[]
const UNASSIGNED = '__unassigned'

// Prefilled when the node is created from the canvas (right-click in a column,
// or dropping a connection on empty canvas).
export interface AddNodePrefillState {
  phaseId: string | null
  connectFrom?: { sourceId: string } | undefined
}

interface AddNodeModalProps {
  open: boolean
  phases: Phase[]
  prefill: AddNodePrefillState | null
  onAdd: (data: VaultNodeData, connect?: { sourceId: string; relation: RelationType }) => void
  onCancel: () => void
}

function slugify(label: string) {
  return label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Math.random().toString(36).slice(2, 6)
}

export function AddNodeModal({ open, phases, prefill, onAdd, onCancel }: AddNodeModalProps) {
  const [label, setLabel]       = useState('')
  const [type, setType]         = useState<NodeType>('tech')
  const [status, setStatus]     = useState<StatusType>('planned')
  const [phaseId, setPhaseId]   = useState<string | null>(null)
  const [relation, setRelation] = useState<RelationType>('flow')

  // sync prefill when the dialog opens
  useEffect(() => {
    if (open) {
      setPhaseId(prefill?.phaseId ?? null)
      setRelation('flow')
    }
  }, [open, prefill])

  function handleAdd() {
    if (!label.trim()) return
    const data: VaultNodeData = {
      id: slugify(label),
      label: label.trim(),
      type,
      status,
      trl: null,
      phaseId,
      tags: [],
      body: '',
      path: '',
      cost: null,
      budget: null,
      duration: null,
      deadline: null,
      attachments: [],
    }
    onAdd(data, prefill?.connectFrom ? { sourceId: prefill.connectFrom.sourceId, relation } : undefined)
    setLabel(''); setType('tech'); setStatus('planned'); setPhaseId(null)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel() }}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm">Add node</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Label *</Label>
            <Input
              autoFocus
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Node name"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1 flex-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={v => setType(v as NodeType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {NODE_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: NODE_COLORS[t] }} />
                        {NODE_TYPE_LABELS[t]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as StatusType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {STATUS_TYPES.map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Phase</Label>
            <Select value={phaseId ?? UNASSIGNED} onValueChange={v => setPhaseId(v === UNASSIGNED ? null : v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {[...phases].sort((a, b) => a.order - b.order).map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                ))}
                <SelectItem value={UNASSIGNED} className="text-xs text-muted-foreground">— unassigned —</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {prefill?.connectFrom && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Connection from source node</Label>
              <Select value={relation} onValueChange={v => setRelation(v as RelationType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {RELATIONS.map(r => (
                    <SelectItem key={r} value={r} className="text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: RELATION_COLORS[r] }} />
                        {RELATION_LABELS[r]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter className="mt-1">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleAdd} disabled={!label.trim()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
