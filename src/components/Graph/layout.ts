import ELK from 'elkjs/lib/elk-api.js'
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker'
import type { Node, Edge } from '@xyflow/react'
import type { VaultNodeData, HandlePos, Phase } from '@/types'

// Layout runs in a web worker so frequent relayouts (this is an editing tool)
// never block the UI thread.
const elk = new ELK({ workerFactory: () => new ElkWorker() })

export const NODE_WIDTH  = 180
export const NODE_HEIGHT = 130

// Horizontal geometry of the phase columns (graph coordinates)
const COLUMN_GAP         = 80
const COLUMN_PAD         = 40
const EMPTY_COLUMN_WIDTH = 240
const BAND_PAD_Y         = 60

export interface ColumnBounds {
  phaseId: string | null // null = trailing "Unassigned" column
  name: string
  color: string | null
  x: number
  width: number
}

export interface LayoutResult {
  nodes: Node<VaultNodeData>[]
  columns: ColumnBounds[]
  bandY: { min: number; max: number }
  // ELK's orthogonal routes per edge id, in final (column-shifted) coordinates
  edgePoints: Map<string, { x: number; y: number }[]>
}

export async function applyLayout(
  nodes: Node<VaultNodeData>[],
  edges: Edge[],
  phases: Phase[],
  prevPositions?: Map<string, { x: number; y: number }>,
  measuredSizes?: Map<string, { width: number; height: number }>,
): Promise<LayoutResult> {
  if (nodes.length === 0) return { nodes, columns: [], bandY: { min: 0, max: 0 }, edgePoints: new Map() }

  const sortedPhases = [...phases].sort((a, b) => a.order - b.order)
  const partitionOf = new Map(sortedPhases.map((p, i) => [p.id, i]))
  const unassignedPartition = sortedPhases.length

  const nodeIds = new Set(nodes.map(n => n.id))
  const layoutEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))

  // Per-node ports: flow/related edges are stored in flow direction, so every
  // edge exits its source EAST and enters its target WEST.
  interface PortDecl { id: string; side: 'EAST' | 'WEST' }
  const portsByNode = new Map<string, PortDecl[]>()
  for (const n of nodes) portsByNode.set(n.id, [])
  for (const e of layoutEdges) {
    portsByNode.get(e.source)!.push({ id: `src-${e.id}`, side: 'EAST' })
    portsByNode.get(e.target)!.push({ id: `tgt-${e.id}`, side: 'WEST' })
  }

  // ELK node size: real measured card size (cards vary — fixed sizes left
  // ports dangling in the air), height bumped when one side carries so many
  // ports they wouldn't fit.
  const widthOf = new Map<string, number>()
  const heightOf = new Map<string, number>()
  for (const n of nodes) {
    const ports = portsByNode.get(n.id) ?? []
    const leftCount = ports.filter(p => p.side === 'WEST').length
    const rightCount = ports.filter(p => p.side === 'EAST').length
    const portMin = Math.max(leftCount, rightCount) * 16 + 24
    const m = measuredSizes?.get(n.id)
    widthOf.set(n.id, m?.width ?? NODE_WIDTH)
    heightOf.set(n.id, Math.max(m?.height ?? NODE_HEIGHT, portMin))
  }

  const result = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'org.eclipse.elk.layered',
      'elk.direction': 'RIGHT', // chronological left → right
      'elk.partitioning.activate': 'true',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      // keep parallel runs apart so routed channels stay readable
      'elk.spacing.edgeNode': '20',
      'elk.spacing.edgeEdge': '14',
      'elk.layered.spacing.edgeNodeBetweenLayers': '20',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      // keep relayouts stable while editing: preserve in-layer order from the
      // previous positions (passed as elk.position hints below)
      'elk.layered.crossingMinimization.semiInteractive': 'true',
    },
    children: nodes.map(n => {
      const phaseId = (n.data as VaultNodeData).phaseId
      const partition = (phaseId != null ? partitionOf.get(phaseId) : undefined) ?? unassignedPartition
      const prev = prevPositions?.get(n.id)
      return {
        id: n.id,
        width: widthOf.get(n.id)!,
        height: heightOf.get(n.id)!,
        layoutOptions: {
          'elk.portConstraints': 'FIXED_SIDE',
          'elk.partitioning.partition': String(partition),
          ...(prev ? { 'elk.position': `(${prev.x},${prev.y})` } : {}),
        },
        ports: (portsByNode.get(n.id) ?? []).map(p => ({
          id: p.id,
          layoutOptions: { 'port.side': p.side },
        })),
      }
    }),
    edges: layoutEdges.map(e => ({
      id: e.id,
      sources: [`src-${e.id}`],
      targets: [`tgt-${e.id}`],
    })),
  })

  // Extract port positions (y relative to node top-left)
  const portY = new Map<string, number>()
  for (const child of result.children ?? []) {
    for (const port of child.ports ?? []) {
      if (port.id) portY.set(port.id, port.y ?? 0)
    }
  }

  const rawPos = new Map<string, { x: number; y: number }>(
    (result.children ?? []).map(c => [c.id!, { x: c.x ?? 0, y: c.y ?? 0 }])
  )

  // ── Column post-processing ─────────────────────────────────────────────────
  // ELK guarantees disjoint x-ranges per partition but reserves no space for
  // empty ones. Walk partitions in order, shifting each one's nodes uniformly
  // (preserves ELK's intra-partition placement and port offsets) and synthesize
  // placeholder columns for empty phases so they remain drop targets.
  const partitionNodes = new Map<number, string[]>()
  for (const n of nodes) {
    const phaseId = (n.data as VaultNodeData).phaseId
    const partition = (phaseId != null ? partitionOf.get(phaseId) : undefined) ?? unassignedPartition
    if (!partitionNodes.has(partition)) partitionNodes.set(partition, [])
    partitionNodes.get(partition)!.push(n.id)
  }

  const shiftX = new Map<string, number>() // nodeId → dx
  // anchor pairs (rawX → mappedX) for remapping edge-route x coordinates —
  // the per-partition shift is a monotonic piecewise-linear x transform
  const anchors: Array<{ raw: number; mapped: number }> = []
  const columns: ColumnBounds[] = []
  let cursor = 0
  const hasUnassigned = partitionNodes.has(unassignedPartition)
  const lastPartition = hasUnassigned ? unassignedPartition : sortedPhases.length - 1

  for (let p = 0; p <= lastPartition; p++) {
    const phase = p < sortedPhases.length ? sortedPhases[p] : null
    if (phase == null && p === unassignedPartition && !hasUnassigned) continue
    const ids = partitionNodes.get(p) ?? []
    let width: number
    if (ids.length > 0) {
      const minX = Math.min(...ids.map(id => rawPos.get(id)!.x))
      const maxX = Math.max(...ids.map(id => rawPos.get(id)!.x + widthOf.get(id)!))
      const dx = cursor + COLUMN_PAD - minX
      for (const id of ids) shiftX.set(id, dx)
      anchors.push({ raw: minX, mapped: minX + dx }, { raw: maxX, mapped: maxX + dx })
      width = (maxX - minX) + COLUMN_PAD * 2
    } else {
      width = EMPTY_COLUMN_WIDTH
    }
    columns.push({
      phaseId: phase?.id ?? null,
      name: phase?.name ?? 'Unassigned',
      color: phase?.color ?? null,
      x: cursor,
      width,
    })
    cursor += width + COLUMN_GAP
  }

  anchors.sort((a, b) => a.raw - b.raw)
  function mapX(x: number): number {
    if (anchors.length === 0) return x
    if (x <= anchors[0].raw) return x + (anchors[0].mapped - anchors[0].raw)
    const last = anchors[anchors.length - 1]
    if (x >= last.raw) return x + (last.mapped - last.raw)
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1], b = anchors[i]
      if (x <= b.raw) {
        const t = b.raw === a.raw ? 0 : (x - a.raw) / (b.raw - a.raw)
        return a.mapped + t * (b.mapped - a.mapped)
      }
    }
    return x
  }

  // ELK's orthogonal routes, x-remapped into the shifted column space.
  // Segments stay axis-aligned: vertical segments keep their x, horizontal
  // segments stretch with the columns.
  const edgePoints = new Map<string, { x: number; y: number }[]>()
  for (const e of result.edges ?? []) {
    const section = e.sections?.[0]
    if (!e.id || !section) continue
    const pts = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
    edgePoints.set(e.id, pts.map(p => ({ x: mapX(p.x), y: p.y })))
  }

  const positioned = nodes.map(n => {
    const pos = rawPos.get(n.id)
    const dx = shiftX.get(n.id) ?? 0
    const sh: HandlePos[] = []
    const th: HandlePos[] = []
    const elkH = heightOf.get(n.id)!
    for (const p of portsByNode.get(n.id) ?? []) {
      const y = portY.get(p.id)
      if (y === undefined) continue
      const hp: HandlePos = { id: p.id, y, yPct: y / elkH, side: p.side === 'WEST' ? 'left' : 'right' }
      if (p.id.startsWith('src-')) sh.push(hp)
      else th.push(hp)
    }
    return {
      ...n,
      position: pos ? { x: pos.x + dx, y: pos.y } : n.position,
      data: {
        ...n.data,
        ...(sh.length > 0 ? { sourceHandles: sh } : {}),
        ...(th.length > 0 ? { targetHandles: th } : {}),
      },
    }
  })

  const bandY = {
    min: Math.min(...positioned.map(n => n.position.y)) - BAND_PAD_Y,
    max: Math.max(...positioned.map(n => n.position.y + heightOf.get(n.id)!)) + BAND_PAD_Y,
  }

  return { nodes: positioned, columns, bandY, edgePoints }
}
