import type {
  VaultNodeData, EdgeData, Phase, Attachment, AttachmentKind,
  NodeType, RelationType, StatusType, ProbabilityLevel, ImpactLevel,
} from '@/types'

// Normalizes any graph.json — current schema or legacy (pre-taxonomy-reform,
// pre-phases) — into the current schema. Idempotent: current-format data
// passes through unchanged. Used by both load paths (bundled seed + openFile).
// scripts/build-graph.ts emits the current schema directly using the same rules.

export interface MigratedGraph {
  nodes: VaultNodeData[]
  edges: EdgeData[]
  phases: Phase[]
}

const CORE_TYPE_REMAP: Record<string, NodeType> = {
  goal: 'goal',
  tech: 'tech',
  capability: 'tech',
  technology: 'tech',
  asset: 'asset',
  resource: 'asset',
  product: 'asset',
  infrastructure: 'asset',
}

// Legacy types that stop being graph nodes and become attachments on their neighbors
const AUX_TYPE_TO_KIND: Record<string, AttachmentKind> = {
  risk: 'risk',
  assumption: 'assumption',
  evidence: 'evidence',
  experiment: 'experiment',
  person: 'person',
  organization: 'organization',
  funding: 'funding',
  unknown: 'note',
}

// requires/produces were one relation read from opposite ends; both become
// 'flow' (source feeds target). A legacy "A requires B" edge points dependent →
// prerequisite, so it additionally gets its endpoints swapped (see edge loop).
// Legacy alternative_to is handled separately: redundant where the pair shares
// a flow target (alternatives are derived from shared outputs now), converted
// to 'related' otherwise.
const RELATION_REMAP: Record<string, RelationType> = {
  flow: 'flow',
  requires: 'flow',
  produces: 'flow',
  related: 'related',
  supports: 'related',
  validates: 'related',
  affects: 'related',
  enables: 'related',
}

const STATUS_REMAP: Record<string, StatusType> = {
  planned: 'planned',
  proposed: 'planned',
  identified: 'planned',
  unknown: 'planned',
  active: 'active',
  collected: 'active',
  done: 'done',
  completed: 'done',
  operational: 'done',
  available: 'done',
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'
}

type RawNode = Record<string, unknown>
type RawEdge = Record<string, unknown>

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function derivePhases(phaseStrings: string[]): Phase[] {
  const distinct = [...new Set(phaseStrings)]
  const allNumeric = distinct.every(s => /^\d+$/.test(s))
  distinct.sort(allNumeric ? (a, b) => Number(a) - Number(b) : undefined)
  return distinct.map((s, i) => ({
    id: `phase-${slugify(s)}`,
    name: allNumeric ? `Phase ${s}` : s,
    order: i,
    color: null,
    description: null,
  }))
}

const VALID_ATTACHMENT_KINDS = new Set<string>(Object.values(AUX_TYPE_TO_KIND))

function sanitizeAttachment(raw: unknown, fallbackId: string): Attachment | null {
  if (typeof raw !== 'object' || raw == null) return null
  const a = raw as Record<string, unknown>
  const kind = asString(a.kind)
  return {
    id: asString(a.id) ?? fallbackId,
    kind: (kind && VALID_ATTACHMENT_KINDS.has(kind) ? kind : 'note') as AttachmentKind,
    label: asString(a.label) ?? 'Untitled',
    body: typeof a.body === 'string' ? a.body : '',
    probability: (a.probability ?? null) as ProbabilityLevel | null,
    impact: (a.impact ?? null) as ImpactLevel | null,
    url: asString(a.url),
  }
}

export function migrateGraph(raw: unknown): MigratedGraph {
  const root = (typeof raw === 'object' && raw != null ? raw : {}) as Record<string, unknown>
  // Legacy "ghost" nodes were vault-import stubs for dangling references —
  // content-free placeholders. The app can't create them; drop them on load
  // (their edges fall away via the dangling-edge filter below).
  const rawNodes: RawNode[] = (Array.isArray(root.nodes) ? root.nodes as RawNode[] : [])
    .filter(n => n.ghost !== true)
  const rawEdges: RawEdge[] = Array.isArray(root.edges) ? root.edges as RawEdge[] : []

  // ── 1. Phases ─────────────────────────────────────────────────────────────
  let phases: Phase[]
  if (Array.isArray(root.phases)) {
    phases = (root.phases as Record<string, unknown>[])
      .map((p, i) => ({
        id: asString(p.id) ?? `phase-${i}`,
        name: asString(p.name) ?? `Phase ${i + 1}`,
        order: typeof p.order === 'number' ? p.order : i,
        color: asString(p.color),
        description: asString(p.description),
      }))
      .sort((a, b) => a.order - b.order)
      .map((p, i) => ({ ...p, order: i })) // densify
  } else {
    phases = derivePhases(rawNodes.map(n => asString(n.phase)).filter((s): s is string => s != null))
  }
  const phaseIds = new Set(phases.map(p => p.id))
  const legacyPhaseToId = new Map(phases.map(p => [p.name.replace(/^Phase /, ''), p.id]))

  function resolvePhaseId(n: RawNode): string | null {
    const direct = asString(n.phaseId)
    if (direct && phaseIds.has(direct)) return direct
    const legacy = asString(n.phase)
    if (legacy) {
      const mapped = legacyPhaseToId.get(legacy) ?? `phase-${slugify(legacy)}`
      if (phaseIds.has(mapped)) return mapped
    }
    return null
  }

  // ── 2. Split aux nodes (legacy types that become attachments) ─────────────
  const auxNodes = new Map<string, RawNode>()
  const coreRaw: RawNode[] = []
  for (const n of rawNodes) {
    const type = asString(n.type) ?? 'unknown'
    if (type in AUX_TYPE_TO_KIND) auxNodes.set(asString(n.id) ?? '', n)
    else coreRaw.push(n)
  }

  // ── 3. Core nodes: type/status remap, attachments, phaseId ────────────────
  const nodes: VaultNodeData[] = coreRaw.map(n => {
    const id = asString(n.id) ?? `node-${slugify(asString(n.label) ?? 'untitled')}`
    const oldType = asString(n.type) ?? 'unknown'
    const type = CORE_TYPE_REMAP[oldType] ?? 'asset'
    const tags = Array.isArray(n.tags) ? [...(n.tags as string[])] : []
    // preserve the original type only where the remap changes meaning
    if (['capability', 'product', 'infrastructure'].includes(oldType)) {
      const wasTag = `was:${oldType}`
      if (!tags.includes(wasTag)) tags.push(wasTag)
    }
    const attachments: Attachment[] = Array.isArray(n.attachments)
      ? (n.attachments as unknown[])
          .map((a, i) => sanitizeAttachment(a, `att-${id}-${i}`))
          .filter((a): a is Attachment => a != null)
      : []
    // legacy node-level risk fields move onto a risk attachment
    const probability = (n.probability ?? null) as ProbabilityLevel | null
    const impact = (n.impact ?? null) as ImpactLevel | null
    if ((probability || impact) && !Array.isArray(n.attachments)) {
      attachments.push({
        id: `att-${id}-inherent-risk`,
        kind: 'risk',
        label: 'Inherent risk',
        body: '',
        probability, impact,
        url: null,
      })
    }
    return {
      id,
      label: asString(n.label) ?? id,
      type,
      status: STATUS_REMAP[asString(n.status) ?? 'unknown'] ?? 'planned',
      trl: typeof n.trl === 'number' ? n.trl : null,
      phaseId: resolvePhaseId(n),
      tags,
      body: typeof n.body === 'string' ? n.body : '',
      path: asString(n.path) ?? '',
      cost: (n.cost ?? null) as VaultNodeData['cost'],
      budget: typeof n.budget === 'number' ? n.budget : null,
      duration: asString(n.duration),
      deadline: asString(n.deadline),
      attachments,
    }
  })
  const coreById = new Map(nodes.map(n => [n.id, n]))

  // ── 4. Aux nodes → attachments on every non-aux neighbor ─────────────────
  const orphanAux: VaultNodeData[] = []
  for (const [auxId, aux] of auxNodes) {
    const oldType = asString(aux.type) ?? 'unknown'
    const hosts = new Set<string>()
    for (const e of rawEdges) {
      const src = asString(e.source), tgt = asString(e.target)
      if (src === auxId && tgt && coreById.has(tgt)) hosts.add(tgt)
      if (tgt === auxId && src && coreById.has(src)) hosts.add(src)
    }
    if (hosts.size === 0) {
      // lossless fallback — never silently drop user content
      orphanAux.push({
        id: auxId,
        label: asString(aux.label) ?? auxId,
        type: 'asset',
        status: STATUS_REMAP[asString(aux.status) ?? 'unknown'] ?? 'planned',
        trl: typeof aux.trl === 'number' ? aux.trl : null,
        phaseId: resolvePhaseId(aux),
        tags: [...(Array.isArray(aux.tags) ? aux.tags as string[] : []), `was:${oldType}`],
        body: typeof aux.body === 'string' ? aux.body : '',
        path: asString(aux.path) ?? '',
        cost: null, budget: null, duration: null, deadline: null,
        attachments: [],
      })
      continue
    }
    for (const hostId of hosts) {
      coreById.get(hostId)!.attachments.push({
        id: `att-${auxId}`,
        kind: AUX_TYPE_TO_KIND[oldType] ?? 'note',
        label: asString(aux.label) ?? auxId,
        body: typeof aux.body === 'string' ? aux.body : '',
        probability: (aux.probability ?? null) as ProbabilityLevel | null,
        impact: (aux.impact ?? null) as ImpactLevel | null,
        url: null,
      })
    }
  }
  nodes.push(...orphanAux)
  const finalIds = new Set(nodes.map(n => n.id))

  // ── 5. Edges: drop consumed/dangling, remap relations ────────────────────
  const edges: EdgeData[] = []
  const legacyAlternatives: EdgeData[] = []
  for (const e of rawEdges) {
    const id = asString(e.id)
    const rawRelation = asString(e.relation) ?? 'related'
    // legacy requires pointed dependent → prerequisite; flow points the other way
    const flip = rawRelation === 'requires'
    const source = asString(flip ? e.target : e.source)
    const target = asString(flip ? e.source : e.target)
    if (!id || !source || !target) continue
    if (!finalIds.has(source) || !finalIds.has(target)) continue // consumed by aux conversion or dangling
    if (rawRelation === 'alternative_to') {
      legacyAlternatives.push({ id, source, target, relation: 'related' })
      continue
    }
    edges.push({ id, source, target, relation: RELATION_REMAP[rawRelation] ?? 'related' })
  }

  // Legacy alternative_to post-pass: redundant when the pair already shares a
  // flow target (that's what makes them alternatives — derived at view time);
  // otherwise keep the link as 'related' so no information is lost silently.
  if (legacyAlternatives.length > 0) {
    const flowTargets = new Map<string, Set<string>>()
    for (const e of edges) {
      if (e.relation !== 'flow') continue
      if (!flowTargets.has(e.source)) flowTargets.set(e.source, new Set())
      flowTargets.get(e.source)!.add(e.target)
    }
    const seenPairs = new Set<string>()
    for (const e of legacyAlternatives) {
      const pairKey = [e.source, e.target].sort().join('::')
      if (seenPairs.has(pairKey)) continue // bidirectional duplicates
      seenPairs.add(pairKey)
      const a = flowTargets.get(e.source)
      const b = flowTargets.get(e.target)
      const sharesTarget = a != null && b != null && [...a].some(t => b.has(t))
      if (!sharesTarget) edges.push(e)
    }
  }

  return { nodes, edges, phases }
}
