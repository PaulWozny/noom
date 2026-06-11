export type NodeType = 'goal' | 'tech' | 'asset'

// 'flow' edges always point in flow/time direction: source feeds (unlocks,
// produces, supplies) target. Old requires/produces collapsed into it — they
// were the same relation read from opposite ends. Alternatives are NOT a
// relation: producers feeding the same asset are alternatives by definition
// (see alternativeRoutes in src/derived.ts).
export type RelationType = 'flow' | 'related'

export type StatusType = 'planned' | 'active' | 'done'

// Derived from the requires-graph + statuses; computed in src/derived.ts, never persisted
export type ReadinessState = 'blocked' | 'ready' | 'in-progress' | 'done'

export type ProbabilityLevel = 'low' | 'medium' | 'high'
export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical'

export type AttachmentKind =
  | 'risk' | 'assumption' | 'evidence' | 'experiment'
  | 'person' | 'organization' | 'funding' | 'note'

export interface Attachment {
  id: string
  kind: AttachmentKind
  label: string
  body: string
  probability: ProbabilityLevel | null
  impact: ImpactLevel | null
  url: string | null
}

export interface Phase {
  id: string
  name: string
  order: number
  color: string | null
  description: string | null
}

export interface CostBreakdown { development: number; operation: number }

// y is ELK's absolute port offset; yPct is y relative to the height ELK assumed
// for the node — handles render at yPct of the REAL card so they always sit on
// its border even when measured height differs from ELK's assumption.
export interface HandlePos { id: string; y: number; yPct: number; side: 'left' | 'right' }

// extends Record<string, unknown> is required by @xyflow/react's Node<T> constraint
export interface VaultNodeData extends Record<string, unknown> {
  id: string
  label: string
  type: NodeType
  status: StatusType
  trl: number | null
  phaseId: string | null
  tags: string[]
  body: string
  path: string
  cost: number | CostBreakdown | null
  budget: number | null
  duration: string | null
  deadline: string | null
  attachments: Attachment[]
  // populated after ELK layout with per-edge port positions
  sourceHandles?: HandlePos[]
  targetHandles?: HandlePos[]
  // derived readiness, merged into flow-node data only (src/derived.ts)
  readiness?: ReadinessState
}

export interface EdgeData {
  id: string
  source: string
  target: string
  relation: RelationType
}

export interface GraphData {
  nodes: VaultNodeData[]
  edges: EdgeData[]
  phases: Phase[]
  meta: {
    generated: string
    nodeCount: number
    edgeCount: number
  }
}

// ── Palette ──────────────────────────────────────────────────────────────────
// Concrete hex values (NOT CSS vars) — these feed SVG fills, edge markers and
// the MiniMap where CSS custom properties are unreliable. The same values are
// mirrored as CSS custom properties in styles.css for CSS-side styling.

export const NODE_COLORS: Record<NodeType, string> = {
  goal:  '#d9a441',
  tech:  '#5b9dd9',
  asset: '#4dab84',
}

export const STATUS_COLORS: Record<StatusType, string> = {
  planned: '#7d879c',
  active:  '#e0913f',
  done:    '#48b27a',
}

export const RELATION_COLORS: Record<RelationType, string> = {
  flow:    '#8b93a7',
  related: '#6d7488',
}

export const RELATION_LABELS: Record<RelationType, string> = {
  flow:    'feeds',
  related: 'related',
}

export const READINESS_COLORS: Record<ReadinessState, string> = {
  blocked:       '#5a6072',
  ready:         '#3dbd8a',
  'in-progress': '#e0913f',
  done:          '#48b27a',
}
