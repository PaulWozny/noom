import type { VaultNodeData, EdgeData, ReadinessState, StatusType } from '@/types'

// Readiness is derived, never stored: it adapts automatically when the user
// rearranges the graph. A node's readiness depends only on its OWN status and
// the STATUSES (not the derived readiness) of its direct feeders, so the
// computation is a single pass with no recursion — cycles in the flow graph
// cannot loop it.
//
// 'flow' edges point in flow direction: edge {source: X, target: Y} means
// X feeds Y, so Y's prerequisites are the SOURCES of its incoming flow edges.
//
// AND vs OR: a tech/goal needs ALL of its inputs, but an asset is satisfied by
// ANY ONE producer (alternative production routes feed the same resource).

export function isDone(status: StatusType): boolean {
  return status === 'done'
}

export function computeReadiness(
  nodes: VaultNodeData[],
  edges: EdgeData[],
): Map<string, ReadinessState> {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const feeders = new Map<string, string[]>()
  for (const e of edges) {
    if (e.relation !== 'flow') continue
    if (!byId.has(e.source) || !byId.has(e.target)) continue
    if (!feeders.has(e.target)) feeders.set(e.target, [])
    feeders.get(e.target)!.push(e.source)
  }

  const out = new Map<string, ReadinessState>()
  for (const n of nodes) {
    if (n.status === 'done') { out.set(n.id, 'done'); continue }
    if (n.status === 'active') { out.set(n.id, 'in-progress'); continue }
    // planned: nodes with no feeders are always ready.
    const reqs = feeders.get(n.id) ?? []
    const done = reqs.filter(id => isDone(byId.get(id)!.status))
    const satisfied = reqs.length === 0 ||
      (n.type === 'asset' ? done.length > 0 : done.length === reqs.length)
    out.set(n.id, satisfied ? 'ready' : 'blocked')
  }
  return out
}

// Unmet feeders of one node — used by the DetailPanel "Blocked by" list.
export function unmetPrereqs(
  nodeId: string,
  nodes: VaultNodeData[],
  edges: EdgeData[],
): VaultNodeData[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  return edges
    .filter(e => e.relation === 'flow' && e.target === nodeId)
    .map(e => byId.get(e.source))
    .filter((n): n is VaultNodeData => n != null && !isDone(n.status))
}

// Alternatives are derived, not stored: producers feeding the same ASSET are
// alternative routes to it by definition (mirrors the readiness OR-rule —
// assets are satisfied by any one producer). Restricted to asset targets:
// feeding the same goal/tech means complementary AND-requirements instead.
export interface AlternativeGroup {
  via: VaultNodeData
  peers: VaultNodeData[]
}

export function alternativeRoutes(
  nodeId: string,
  nodes: VaultNodeData[],
  edges: EdgeData[],
): AlternativeGroup[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const producersOf = new Map<string, string[]>()
  for (const e of edges) {
    if (e.relation !== 'flow') continue
    const target = byId.get(e.target)
    if (target?.type !== 'asset') continue
    if (!producersOf.has(e.target)) producersOf.set(e.target, [])
    producersOf.get(e.target)!.push(e.source)
  }
  const groups: AlternativeGroup[] = []
  for (const [assetId, producers] of producersOf) {
    if (!producers.includes(nodeId)) continue
    const peers = [...new Set(producers)]
      .filter(id => id !== nodeId)
      .map(id => byId.get(id))
      .filter((n): n is VaultNodeData => n != null)
    if (peers.length > 0) groups.push({ via: byId.get(assetId)!, peers })
  }
  return groups
}

// Transitive upstream + downstream chain of a node over flow edges — used to
// highlight the full dependency path when a node is selected.
export function dependencyChain(
  nodeId: string,
  edges: EdgeData[],
): Set<string> {
  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const e of edges) {
    if (e.relation !== 'flow') continue
    if (!down.has(e.source)) down.set(e.source, [])
    down.get(e.source)!.push(e.target)
    if (!up.has(e.target)) up.set(e.target, [])
    up.get(e.target)!.push(e.source)
  }
  const chain = new Set<string>([nodeId])
  for (const adj of [up, down]) {
    const queue = [nodeId]
    while (queue.length > 0) {
      const cur = queue.pop()!
      for (const next of adj.get(cur) ?? []) {
        if (!chain.has(next)) { chain.add(next); queue.push(next) }
      }
    }
  }
  return chain
}
