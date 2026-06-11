import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { TrlBar } from './TrlBar'
import { RiskMatrix } from './RiskMatrix'
import { unmetPrereqs, alternativeRoutes } from '@/derived'
import { Tip } from '@/components/Tip'
import { NODE_ICONS, NODE_TYPE_LABELS, ATTACHMENT_ICONS, ATTACHMENT_KINDS, READINESS_META } from '@/theme'
import type {
  VaultNodeData, EdgeData, NodeType, StatusType, Phase, ReadinessState,
  Attachment, AttachmentKind, ProbabilityLevel, ImpactLevel,
} from '@/types'
import { NODE_COLORS, STATUS_COLORS, RELATION_COLORS, RELATION_LABELS } from '@/types'

const NODE_TYPES: NodeType[] = ['goal', 'tech', 'asset']
const STATUS_TYPES: StatusType[] = ['planned', 'active', 'done']
const UNASSIGNED = '__unassigned'

interface DetailPanelProps {
  node: VaultNodeData
  allNodes: VaultNodeData[]
  allEdges: EdgeData[]
  phases: Phase[]
  readiness: ReadinessState | undefined
  onJumpTo: (id: string) => void
  onSaveNode?: (id: string, patch: Partial<VaultNodeData>) => void
}

function FieldSelect<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={v => onChange(v as T)}>
      <SelectTrigger className="h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function PhaseSelect({ value, phases, onChange }: {
  value: string | null
  phases: Phase[]
  onChange: (phaseId: string | null) => void
}) {
  return (
    <FieldSelect
      value={value ?? UNASSIGNED}
      onChange={v => onChange(v === UNASSIGNED ? null : v)}
      options={[
        ...[...phases].sort((a, b) => a.order - b.order).map(p => ({ value: p.id, label: p.name })),
        { value: UNASSIGNED, label: '— unassigned —' },
      ]}
    />
  )
}

function CostDisplay({ cost }: { cost: VaultNodeData['cost'] }) {
  if (cost == null) return null
  if (typeof cost === 'number') {
    return (
      <div className="flex justify-between text-xs py-1 border-b border-border">
        <span className="text-muted-foreground">Cost</span>
        <span>€{cost.toLocaleString()}</span>
      </div>
    )
  }
  return (
    <>
      <div className="flex justify-between text-xs py-1 border-b border-border">
        <span className="text-muted-foreground">Development</span>
        <span>€{cost.development.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-xs py-1 border-b border-border">
        <span className="text-muted-foreground">Operation / yr</span>
        <span>€{cost.operation.toLocaleString()}</span>
      </div>
    </>
  )
}

// ── Node edit form ────────────────────────────────────────────────────────────

interface EditFormProps {
  node: VaultNodeData
  phases: Phase[]
  onSave: (patch: Partial<VaultNodeData>) => void
  onCancel: () => void
}

function EditForm({ node, phases, onSave, onCancel }: EditFormProps) {
  const [label, setLabel]     = useState(node.label)
  const [type, setType]       = useState<NodeType>(node.type)
  const [status, setStatus]   = useState<StatusType>(node.status)
  const [phaseId, setPhaseId] = useState<string | null>(node.phaseId)
  const [trl, setTrl]         = useState(node.trl?.toString() ?? '')
  const [tags, setTags]       = useState(node.tags.join(', '))
  const [body, setBody]       = useState(node.body)

  function handleSave() {
    const trlNum = trl.trim() ? Number(trl.trim()) : null
    onSave({
      label:  label.trim() || node.label,
      type,
      status,
      phaseId,
      trl:    (trlNum != null && !isNaN(trlNum)) ? Math.max(1, Math.min(9, trlNum)) : null,
      tags:   tags.split(',').map(t => t.trim()).filter(Boolean),
      body,
    })
  }

  const fieldClass = "h-7 text-xs border-input"

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      <div className="flex justify-between items-center pt-3 pb-1 pr-8 border-b border-border">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Edit</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={onCancel}>Cancel</Button>
          <Button size="sm" className="h-6 text-[11px] px-2" onClick={handleSave}>Save</Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[10px]">Label</Label>
        <Input value={label} onChange={e => setLabel(e.target.value)} className={fieldClass} />
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-[10px]">Type</Label>
          <FieldSelect value={type} onChange={setType}
            options={NODE_TYPES.map(t => ({ value: t, label: NODE_TYPE_LABELS[t] }))} />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-[10px]">Status</Label>
          <FieldSelect value={status} onChange={setStatus}
            options={STATUS_TYPES.map(s => ({ value: s, label: s }))} />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-[10px]">Phase</Label>
          <PhaseSelect value={phaseId} phases={phases} onChange={setPhaseId} />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-[10px]">TRL (1–9)</Label>
          <Input value={trl} onChange={e => setTrl(e.target.value)} placeholder="—" type="number" min={1} max={9} className={fieldClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[10px]">Tags (comma-separated)</Label>
        <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="isru, water, …" className={fieldClass} />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[10px]">Body (markdown)</Label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={6}
          className="rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y min-h-[80px]"
          placeholder="Markdown description…"
        />
      </div>
    </div>
  )
}

// ── Attachments ───────────────────────────────────────────────────────────────

const PROBABILITIES: ProbabilityLevel[] = ['low', 'medium', 'high']
const IMPACTS: ImpactLevel[] = ['low', 'medium', 'high', 'critical']
const NONE = '__none'

function AttachmentEditor({ attachment, onSave, onCancel }: {
  attachment: Attachment
  onSave: (a: Attachment) => void
  onCancel: () => void
}) {
  const [kind, setKind]   = useState<AttachmentKind>(attachment.kind)
  const [label, setLabel] = useState(attachment.label)
  const [body, setBody]   = useState(attachment.body)
  const [url, setUrl]     = useState(attachment.url ?? '')
  const [probability, setProbability] = useState<ProbabilityLevel | null>(attachment.probability)
  const [impact, setImpact] = useState<ImpactLevel | null>(attachment.impact)

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background/50 p-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <FieldSelect value={kind} onChange={setKind}
            options={ATTACHMENT_KINDS.map(k => ({ value: k, label: k }))} />
        </div>
        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label"
          className="h-7 text-xs flex-[2]" />
      </div>
      {kind === 'risk' && (
        <div className="flex gap-2">
          <div className="flex-1">
            <FieldSelect value={probability ?? NONE}
              onChange={v => setProbability(v === NONE ? null : v as ProbabilityLevel)}
              options={[{ value: NONE, label: 'probability —' }, ...PROBABILITIES.map(p => ({ value: p, label: `probability: ${p}` }))]} />
          </div>
          <div className="flex-1">
            <FieldSelect value={impact ?? NONE}
              onChange={v => setImpact(v === NONE ? null : v as ImpactLevel)}
              options={[{ value: NONE, label: 'impact —' }, ...IMPACTS.map(i => ({ value: i, label: `impact: ${i}` }))]} />
          </div>
        </div>
      )}
      <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs resize-y"
        placeholder="Details (markdown)…" />
      <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="URL (optional)"
        className="h-7 text-xs" />
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-6 text-[11px] px-2"
          disabled={!label.trim()}
          onClick={() => onSave({
            ...attachment, kind, label: label.trim(), body,
            url: url.trim() || null,
            probability: kind === 'risk' ? probability : null,
            impact: kind === 'risk' ? impact : null,
          })}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

function AttachmentsSection({ node, onSaveNode }: {
  node: VaultNodeData
  onSaveNode?: ((id: string, patch: Partial<VaultNodeData>) => void) | undefined
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const attachments = node.attachments

  if (attachments.length === 0 && !onSaveNode) return null

  const save = (list: Attachment[]) => onSaveNode?.(node.id, { attachments: list })

  function addNew() {
    const a: Attachment = {
      id: `att-${node.id}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'note', label: '', body: '', probability: null, impact: null, url: null,
    }
    save([...attachments, a])
    setEditingId(a.id)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
        </p>
        {onSaveNode && (
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 gap-1" onClick={addNew}>
            <Plus className="w-3 h-3" /> add
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {attachments.map(a => {
          if (a.id === editingId) {
            return (
              <AttachmentEditor key={a.id} attachment={a}
                onSave={updated => { save(attachments.map(x => x.id === a.id ? updated : x)); setEditingId(null) }}
                onCancel={() => {
                  // discard never-filled drafts created via "add"
                  if (!a.label) save(attachments.filter(x => x.id !== a.id))
                  setEditingId(null)
                }}
              />
            )
          }
          const Icon = ATTACHMENT_ICONS[a.kind]
          const expanded = expandedId === a.id
          return (
            <div key={a.id} className="rounded-md border border-border/60 px-2 py-1">
              <div className="flex items-center gap-1.5">
                <Icon className="w-3 h-3 shrink-0 text-muted-foreground" />
                <button
                  className="flex-1 text-left text-xs truncate hover:underline"
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                  title={expanded ? 'Collapse' : 'Expand'}
                >
                  {a.label || <span className="italic text-muted-foreground">untitled</span>}
                </button>
                <span className="text-[9px] text-muted-foreground shrink-0">{a.kind}</span>
                {onSaveNode && (
                  <>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0"
                      onClick={() => setEditingId(a.id)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => save(attachments.filter(x => x.id !== a.id))}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
              {expanded && (a.body || a.url || a.probability || a.impact) && (
                <div className="mt-1 pl-4 text-xs text-muted-foreground">
                  {(a.probability || a.impact) && (
                    <p className="text-[10px] mb-1">
                      {a.probability && <>probability: <strong>{a.probability}</strong> </>}
                      {a.impact && <>impact: <strong>{a.impact}</strong></>}
                    </p>
                  )}
                  {a.body && (
                    <div className="detail-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.body}</ReactMarkdown>
                    </div>
                  )}
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noreferrer" className="text-[10px] underline break-all">
                      {a.url}
                    </a>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function DetailPanel({ node, allNodes, allEdges, phases, readiness, onJumpTo, onSaveNode }: DetailPanelProps) {
  const [editing, setEditing] = useState(false)

  const baseColor   = NODE_COLORS[node.type] ?? '#555'
  const statusColor = STATUS_COLORS[node.status] ?? '#555'
  const nodeMap     = new Map(allNodes.map(n => [n.id, n]))
  const outEdges    = allEdges.filter(e => e.source === node.id)
  const inEdges     = allEdges.filter(e => e.target === node.id)
  const meta        = readiness ? READINESS_META[readiness] : null
  const TypeIcon    = NODE_ICONS[node.type]
  const blockers    = readiness === 'blocked' ? unmetPrereqs(node.id, allNodes, allEdges) : []
  const altGroups   = alternativeRoutes(node.id, allNodes, allEdges)
  const risks       = node.attachments.filter(a => a.kind === 'risk')

  if (editing) {
    return (
      <EditForm
        node={node}
        phases={phases}
        onSave={patch => {
          onSaveNode?.(node.id, patch)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 pb-6 gap-3">

      <SheetHeader className="pb-0">
        {/* pr-8/pt-3 align the row with the Sheet's absolute ✕ (top-4, 16px icon
            → center at 24px): pt-3 + h-6 buttons puts this row's center there too */}
        <div className="flex gap-2 items-center mb-1 flex-wrap pr-8 pt-3">
          <Badge style={{ background: baseColor }} className="text-white text-[10px] font-bold uppercase tracking-wide border-0 rounded px-2 py-0.5 gap-1">
            <TypeIcon className="w-3 h-3" />
            {NODE_TYPE_LABELS[node.type]}
          </Badge>
          <Badge variant="outline" style={{ borderColor: statusColor, color: statusColor }} className="text-[10px] px-2 py-0.5 rounded">
            {node.status}
          </Badge>
          {meta && (
            <Tip label={meta.description}>
              <Badge variant="outline" style={{ borderColor: meta.color, color: meta.color }} className="text-[10px] px-2 py-0.5 rounded gap-1 cursor-default">
                <meta.icon className="w-3 h-3" />
                {meta.label}
              </Badge>
            </Tip>
          )}
          {onSaveNode && (
            <Button variant="ghost" size="sm" className="ml-auto h-6 text-[11px] px-2" onClick={() => setEditing(true)}>
              ✎ edit
            </Button>
          )}
        </div>
        <SheetTitle className="text-lg font-bold leading-snug text-left">
          {node.label}
        </SheetTitle>
      </SheetHeader>

      {blockers.length > 0 && meta && (
        <div className="rounded-md border px-3 py-2" style={{ borderColor: `${meta.color}66`, background: `${meta.color}11` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: meta.color }}>
            Blocked by
          </p>
          {blockers.map(b => (
            <Button key={b.id} variant="ghost" size="sm"
              className="w-full justify-start gap-2 text-xs h-6 px-1"
              onClick={() => onJumpTo(b.id)}
            >
              <span className="size-1.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[b.status] ?? '#888' }} />
              <span className="flex-1 text-left truncate">{b.label}</span>
              <span className="text-[9px] text-muted-foreground">{b.status}</span>
            </Button>
          ))}
        </div>
      )}

      {altGroups.length > 0 && (
        <div className="rounded-md border border-border/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">
            Alternative routes
          </p>
          {altGroups.map(g => (
            <div key={g.via.id} className="mb-1 last:mb-0">
              <p className="text-[10px] text-muted-foreground mb-0.5">via {g.via.label}</p>
              {g.peers.map(p => (
                <Button key={p.id} variant="ghost" size="sm"
                  className="w-full justify-start gap-2 text-xs h-6 px-1"
                  onClick={() => onJumpTo(p.id)}
                >
                  <span className="size-1.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[p.status] ?? '#888' }} />
                  <span className="flex-1 text-left truncate">{p.label}</span>
                  <span className="text-[9px] text-muted-foreground">{p.status}</span>
                </Button>
              ))}
            </div>
          ))}
        </div>
      )}

      {node.trl != null && <TrlBar trl={node.trl} />}

      <div>
        <CostDisplay cost={node.cost} />
        {node.budget != null && (
          <div className="flex justify-between text-xs py-1 border-b border-border">
            <span className="text-muted-foreground">Budget</span>
            <span>€{node.budget.toLocaleString()}</span>
          </div>
        )}
        {node.deadline && (
          <div className="flex justify-between text-xs py-1 border-b border-border">
            <span className="text-muted-foreground">Deadline</span>
            <span>{node.deadline}</span>
          </div>
        )}
        {node.duration && (
          <div className="flex justify-between text-xs py-1 border-b border-border">
            <span className="text-muted-foreground">Duration</span>
            <span>{node.duration}</span>
          </div>
        )}
      </div>

      {risks.length > 0 && <RiskMatrix risks={risks} />}

      <AttachmentsSection node={node} onSaveNode={onSaveNode} />

      {node.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {node.tags.map(t => (
            <Badge key={t} variant="outline"
              style={{ borderColor: `${baseColor}55`, color: baseColor, background: `${baseColor}18` }}
              className="text-[10px] px-2 py-0.5 rounded"
            >
              {t}
            </Badge>
          ))}
        </div>
      )}

      {node.body && (
        <>
          <Separator className="bg-border" />
          <div className="detail-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.body}</ReactMarkdown>
          </div>
        </>
      )}

      {outEdges.length > 0 && (
        <>
          <Separator className="bg-border" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">Connections</p>
            {outEdges.map(e => {
              const target = nodeMap.get(e.target)
              if (!target) return null
              const rc = RELATION_COLORS[e.relation] ?? '#666'
              return (
                <Button key={e.id} variant="ghost" size="sm"
                  className="w-full justify-start gap-2 text-xs h-7 px-2 mb-0.5"
                  onClick={() => onJumpTo(target.id)}
                >
                  <span className="text-[9px] shrink-0 whitespace-nowrap" style={{ color: rc }}>
                    {RELATION_LABELS[e.relation] ?? e.relation} →
                  </span>
                  <span className="flex-1 text-left truncate">{target.label}</span>
                </Button>
              )
            })}
          </div>
        </>
      )}

      {inEdges.length > 0 && (
        <>
          <Separator className="bg-border" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1.5">Used by</p>
            {inEdges.map(e => {
              const source = nodeMap.get(e.source)
              if (!source) return null
              const rc = RELATION_COLORS[e.relation] ?? '#666'
              return (
                <Button key={e.id} variant="ghost" size="sm"
                  className="w-full justify-start gap-2 text-xs h-7 px-2 mb-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => onJumpTo(source.id)}
                >
                  <span className="text-[9px] shrink-0" style={{ color: NODE_COLORS[source.type] ?? '#666' }}>
                    {NODE_TYPE_LABELS[source.type] ?? source.type}
                  </span>
                  <span className="flex-1 text-left truncate">{source.label}</span>
                  <span className="text-[9px] shrink-0 whitespace-nowrap" style={{ color: rc }}>
                    ← {e.relation === 'flow' ? 'fed by' : RELATION_LABELS[e.relation] ?? e.relation}
                  </span>
                </Button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
