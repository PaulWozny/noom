import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, useReactFlow, useUpdateNodeInternals,
  type Node, type Edge, type Connection, type FinalConnectionState,
  type IsValidConnection, type OnNodesChange, MarkerType,
} from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/Tip'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
} from '@/components/ui/context-menu'
import '@xyflow/react/dist/style.css'

import { NodeCard } from './nodes/NodeCard'
import { LabeledEdge } from './edges/LabeledEdge'
import { ColumnBands } from './ColumnBands'
import { ColumnHeaders } from './ColumnHeaders'
import { RelationPicker } from '@/components/RelationPicker'
import { applyLayout, NODE_WIDTH, NODE_HEIGHT, type ColumnBounds } from './layout'
import type { VaultNodeData, EdgeData, HandlePos, Phase, RelationType, ReadinessState } from '@/types'
import { NODE_COLORS, RELATION_COLORS } from '@/types'
import { useStore } from '@/store'
import { dependencyChain } from '@/derived'
import { useThemeMode } from '@/theme-mode'

const nodeTypes = { vaultNode: NodeCard }
const edgeTypes = { labeled: LabeledEdge }

// Prefill for the AddNodeModal when a node is created from the canvas
export interface AddNodePrefill {
  phaseId: string | null
  // present when created by dropping a connection on empty canvas: the new
  // node is immediately wired as `source --relation--> new node`
  connectFrom?: { sourceId: string } | undefined
}

interface GraphProps {
  allNodes: VaultNodeData[]
  allEdges: EdgeData[]
  phases: Phase[]
  readiness: Map<string, ReadinessState>
  visibleNodeIds: Set<string>
  selectedId: string | null
  focusNeighborhood: boolean
  onSelectNode: (id: string | null) => void
  onRequestAddNode: (prefill: AddNodePrefill) => void
  onOpenPhaseManager: () => void
}

type HandleData = { sourceHandles?: HandlePos[]; targetHandles?: HandlePos[] }

function buildFlowNodes(
  allNodes: VaultNodeData[],
  visibleNodeIds: Set<string>,
  readiness: Map<string, ReadinessState>,
  selectedId: string | null,
  strongFocus: boolean,
  chainIds: Set<string> | null,
  positions: Map<string, { x: number; y: number }>,
  handles: Map<string, HandleData>,
): Node<VaultNodeData>[] {
  return allNodes.map(n => {
    const hidden = !visibleNodeIds.has(n.id)
    // nodes outside the selection's dependency chain fade back; the "strong
    // focus" filter option makes them nearly disappear
    const dimmed = !hidden && chainIds != null && !chainIds.has(n.id)
    const handleData = handles.get(n.id) ?? {}
    return {
      id: n.id,
      type: 'vaultNode',
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: {
        ...n,
        readiness: readiness.get(n.id),
        ...handleData,
      },
      hidden,
      selected: n.id === selectedId,
      style: dimmed
        ? strongFocus
          ? { opacity: 0.1, pointerEvents: 'none' as const }
          : { opacity: 0.35 }
        : undefined,
    }
  })
}

function buildFlowEdges(
  allEdges: EdgeData[],
  visibleNodeIds: Set<string>,
  selectedId: string | null,
  chainIds: Set<string> | null,
  handles: Map<string, HandleData>,
  edgePoints: Map<string, { x: number; y: number }[]>,
): Edge[] {
  // a brand-new edge has no ELK ports until the next relayout — fall back to
  // the default handles so it renders immediately instead of failing (RF #008)
  const hasPort = (nodeId: string, kind: 'sourceHandles' | 'targetHandles', id: string) =>
    handles.get(nodeId)?.[kind]?.some(h => h.id === id) ?? false
  return allEdges.map(e => {
    const hidden = !visibleNodeIds.has(e.source) || !visibleNodeIds.has(e.target)
    // emphasize the selected node's whole dependency chain, not just neighbors
    const onChain = !hidden && chainIds != null &&
      chainIds.has(e.source) && chainIds.has(e.target)
    const baseOpacity = hidden ? 0
      : selectedId != null ? (onChain ? 0.88 : 0.06) : 0.28
    const color = RELATION_COLORS[e.relation] ?? '#666'
    const points = edgePoints.get(e.id)
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: hasPort(e.source, 'sourceHandles', `src-${e.id}`) ? `src-${e.id}` : undefined,
      targetHandle: hasPort(e.target, 'targetHandles', `tgt-${e.id}`) ? `tgt-${e.id}` : undefined,
      type: 'labeled',
      data: { relation: e.relation, baseOpacity, ...(points ? { points } : {}) },
      hidden,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      style: { opacity: baseOpacity },
    }
  })
}

export function Graph({
  allNodes, allEdges, phases, readiness, visibleNodeIds, selectedId,
  focusNeighborhood, onSelectNode, onRequestAddNode, onOpenPhaseManager,
}: GraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<VaultNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView, getNode, getNodes, screenToFlowPosition } = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()
  const prevLayoutKey = useRef('')
  const positionsRef  = useRef(new Map<string, { x: number; y: number }>())
  const handlesRef    = useRef(new Map<string, HandleData>())
  const edgePointsRef = useRef(new Map<string, { x: number; y: number }[]>())
  const [forceLayoutKey, setForceLayoutKey] = useState(0)
  const [pendingConn, setPendingConn] = useState<Connection | null>(null)
  const [columns, setColumns] = useState<ColumnBounds[]>([])
  const [bandY, setBandY] = useState({ min: 0, max: 0 })
  const [hoverPhaseId, setHoverPhaseId] = useState<string | null | undefined>(undefined)
  const paneFlowPos = useRef({ x: 0, y: 0 })

  // re-run layout once React Flow has measured real card heights (and whenever
  // an edit changes a card's size) so ELK ports fit the actual node geometry
  const [measureTick, setMeasureTick] = useState(0)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const handleNodesChange: OnNodesChange<Node<VaultNodeData>> = useCallback(changes => {
    onNodesChange(changes)
    if (changes.some(c => c.type === 'dimensions' && c.dimensions)) {
      setMeasureTick(t => t + 1)
    }
  }, [onNodesChange])

  const themeMode = useThemeMode(s => s.mode)
  const deleteNode = useStore(s => s.deleteNode)
  const deleteEdge = useStore(s => s.deleteEdge)
  const addEdge    = useStore(s => s.addEdge)
  const updateEdge = useStore(s => s.updateEdge)
  const updateNode = useStore(s => s.updateNode)

  const handleRelayout = useCallback(() => {
    positionsRef.current = new Map()
    handlesRef.current   = new Map()
    edgePointsRef.current = new Map()
    prevLayoutKey.current = ''
    setForceLayoutKey(k => k + 1)
  }, [])

  const onEdgeMouseEnter = useCallback((_: React.MouseEvent, edge: Edge) => {
    setEdges(es => es.map(e => e.id === edge.id
      ? { ...e, data: { ...e.data, hovered: true }, style: { ...e.style, opacity: 0.88 } }
      : e))
  }, [setEdges])

  const onEdgeMouseLeave = useCallback((_: React.MouseEvent, edge: Edge) => {
    setEdges(es => es.map(e => {
      if (e.id !== edge.id) return e
      const base = (e.data as { baseOpacity?: number }).baseOpacity ?? 0.28
      return { ...e, data: { ...e.data, hovered: false }, style: { ...e.style, opacity: base } }
    }))
  }, [setEdges])

  // Full transitive dependency chain of the selection (upstream + downstream)
  const chainIds = selectedId ? dependencyChain(selectedId, allEdges) : null

  // Column geometry comes from the layout pass, but name/color edits in the
  // Phase Manager don't trigger a relayout — merge the live values at render
  // time so recoloring/renaming a phase shows up immediately.
  const liveColumns = columns.map(c => {
    const phase = c.phaseId != null ? phases.find(p => p.id === c.phaseId) : undefined
    return phase ? { ...c, name: phase.name, color: phase.color } : c
  })

  useEffect(() => {
    const flowNodes = buildFlowNodes(allNodes, visibleNodeIds, readiness, selectedId, focusNeighborhood, chainIds, positionsRef.current, handlesRef.current)
    const flowEdges = buildFlowEdges(allEdges, visibleNodeIds, selectedId, chainIds, handlesRef.current, edgePointsRef.current)

    // relayout when visibility, phase structure, node→phase assignment, or the
    // edge set changes — edits stay visually stable via elk.position hints
    const phaseSig = phases.map(p => `${p.id}@${p.order}`).join(',')
    const assignSig = allNodes.map(n => n.phaseId ?? '').join(',')
    const edgeSig = allEdges.map(e => `${e.id}:${e.relation}`).join(',')
    const measuredSizes = new Map<string, { width: number; height: number }>()
    for (const n of nodesRef.current) {
      if (n.measured?.width && n.measured?.height) {
        measuredSizes.set(n.id, { width: Math.round(n.measured.width), height: Math.round(n.measured.height) })
      }
    }
    // measured is React-Flow-managed state living on our node objects — every
    // rebuild must carry it over, or RF treats the nodes as unmeasured (hides
    // them) and re-emits dimension changes, looping with measureTick
    const measuredById = new Map(nodesRef.current.map(n => [n.id, n.measured]))
    const withMeasured = (n: Node<VaultNodeData>): Node<VaultNodeData> => {
      const m = measuredById.get(n.id)
      return m ? { ...n, measured: m } : n
    }
    const layoutKey = `${allNodes.length}-${[...visibleNodeIds].sort().join(',')}-${phaseSig}-${assignSig}-${edgeSig}-${forceLayoutKey}-m${measureTick}`
    if (layoutKey !== prevLayoutKey.current) {
      prevLayoutKey.current = layoutKey
      const visibleFlowNodes = flowNodes.filter(n => !n.hidden)
      const visibleFlowEdges = flowEdges.filter(e => !e.hidden)
      const firstLayout = positionsRef.current.size === 0
      applyLayout(visibleFlowNodes, visibleFlowEdges, phases, positionsRef.current, measuredSizes).then(result => {
        for (const n of result.nodes) {
          positionsRef.current.set(n.id, n.position)
          const hd: HandleData = {}
          if (n.data.sourceHandles) hd.sourceHandles = n.data.sourceHandles as HandlePos[]
          if (n.data.targetHandles) hd.targetHandles = n.data.targetHandles as HandlePos[]
          handlesRef.current.set(n.id, hd)
        }
        const final = flowNodes.map(n => withMeasured({
          ...n,
          position: positionsRef.current.get(n.id) ?? n.position,
          data: { ...n.data, ...(handlesRef.current.get(n.id) ?? {}) },
        }))
        edgePointsRef.current = result.edgePoints
        setNodes(final)
        // edges referencing not-yet-registered ports fall back to default
        // handles for now; they snap onto their ELK ports below
        setEdges(flowEdges)
        setColumns(result.columns)
        setBandY(result.bandY)
        // per-edge handles changed programmatically — React Flow must
        // re-register them (RF #008) before edges may reference the new ports
        requestAnimationFrame(() => {
          updateNodeInternals(final.map(n => n.id))
          requestAnimationFrame(() => {
            setEdges(buildFlowEdges(allEdges, visibleNodeIds, selectedId, chainIds, handlesRef.current, edgePointsRef.current))
          })
        })
        if (firstLayout) setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
      })
    } else {
      setNodes(flowNodes.map(withMeasured))
      setEdges(flowEdges)
      // node objects were replaced — refresh RF's handle registry so edges
      // keep resolving their per-edge handle ids
      requestAnimationFrame(() => updateNodeInternals(flowNodes.map(n => n.id)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes, allEdges, phases, readiness, visibleNodeIds, selectedId, focusNeighborhood, forceLayoutKey, measureTick])

  // Fit to selected node
  const prevSelectedId = useRef<string | null>(null)
  useEffect(() => {
    if (selectedId && selectedId !== prevSelectedId.current) {
      prevSelectedId.current = selectedId
      setTimeout(() => {
        const n = getNode(selectedId)
        if (n && !n.hidden) {
          fitView({ nodes: [n], padding: 0.4, duration: 400, maxZoom: 1.5 })
        }
      }, 80)
    } else if (!selectedId) {
      prevSelectedId.current = null
    }
  }, [selectedId, fitView, getNode])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onSelectNode(node.id === selectedId ? null : node.id)
  }, [selectedId, onSelectNode])

  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode])

  const onNodesDelete = useCallback((deleted: Node[]) => {
    for (const n of deleted) deleteNode(n.id)
  }, [deleteNode])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const e of deleted) deleteEdge(e.id)
  }, [deleteEdge])

  // ── connections ────────────────────────────────────────────────────────────
  const isValidConnection: IsValidConnection = useCallback(conn =>
    conn.source !== conn.target, [])

  const onConnect = useCallback((conn: Connection) => {
    setPendingConn(conn)
  }, [])

  // connection dropped without hitting a handle: over a node body → treat as a
  // connection to that node; over empty canvas → create a connected node there
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    if (connectionState.isValid) return // landed on a handle — onConnect handles it
    if (!connectionState.fromNode || connectionState.fromHandle?.type !== 'source') return
    const fromId = connectionState.fromNode.id
    const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event
    const pos = screenToFlowPosition({ x: clientX, y: clientY })
    const hit = getNodes().find(n => !n.hidden && n.id !== fromId &&
      pos.x >= n.position.x && pos.x <= n.position.x + (n.measured?.width ?? NODE_WIDTH) &&
      pos.y >= n.position.y && pos.y <= n.position.y + (n.measured?.height ?? NODE_HEIGHT))
    if (hit) {
      setPendingConn({ source: fromId, target: hit.id, sourceHandle: null, targetHandle: null })
      return
    }
    onRequestAddNode({
      phaseId: phaseAt(columns, pos.x),
      connectFrom: { sourceId: fromId },
    })
  }, [columns, onRequestAddNode, screenToFlowPosition, getNodes])

  const handleRelationSelect = useCallback((relation: RelationType) => {
    if (!pendingConn) return
    const exists = useStore.getState().vaultEdges.some(e =>
      e.source === pendingConn.source && e.target === pendingConn.target && e.relation === relation)
    if (!exists) {
      const id = `${pendingConn.source}-${pendingConn.target}-${relation}-${Date.now()}`
      addEdge({ id, source: pendingConn.source!, target: pendingConn.target!, relation })
    }
    setPendingConn(null)
  }, [pendingConn, addEdge])

  // drag an edge endpoint onto another node to rewire it
  const onReconnect = useCallback((oldEdge: Edge, conn: Connection) => {
    if (conn.source === conn.target) return
    updateEdge(oldEdge.id, { source: conn.source!, target: conn.target! })
  }, [updateEdge])

  // ── drag node into a column = phase reassignment ───────────────────────────
  const onNodeDrag = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    setHoverPhaseId(phaseAt(columns, node.position.x + (node.measured?.width ?? NODE_WIDTH) / 2))
  }, [columns])

  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    setHoverPhaseId(undefined)
    const dropPhase = phaseAt(columns, node.position.x + (node.measured?.width ?? NODE_WIDTH) / 2)
    const currentPhase = (node.data as VaultNodeData).phaseId
    if (dropPhase !== currentPhase) {
      updateNode(node.id, { phaseId: dropPhase })
    } else {
      // same column — snap back to the laid-out position
      const prev = positionsRef.current.get(node.id)
      if (prev) setNodes(ns => ns.map(n => n.id === node.id ? { ...n, position: prev } : n))
    }
  }, [columns, updateNode, setNodes])

  // pane right-click → add node in that column
  const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    const { clientX, clientY } = event as React.MouseEvent
    paneFlowPos.current = screenToFlowPosition({ x: clientX, y: clientY })
  }, [screenToFlowPosition])

  const visiblePhaseCounts = new Map<string | null, number>()
  for (const n of allNodes) {
    if (!visibleNodeIds.has(n.id)) continue
    const key = n.phaseId != null && columns.some(c => c.phaseId === n.phaseId) ? n.phaseId : null
    visiblePhaseCounts.set(key, (visiblePhaseCounts.get(key) ?? 0) + 1)
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
              colorMode={themeMode}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onEdgeMouseEnter={onEdgeMouseEnter}
              onEdgeMouseLeave={onEdgeMouseLeave}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              edgesReconnectable
              onReconnect={onReconnect}
              nodesDraggable
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onPaneContextMenu={onPaneContextMenu}
              minZoom={0.05}
              maxZoom={3}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              {/* pushed below the sticky column-header strip */}
              <Panel position="top-right" className="flex gap-1" style={{ marginTop: 44 }}>
                <Tip label="Recompute the layout from scratch" side="bottom">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={handleRelayout}
                  >
                    ↺ relayout
                  </Button>
                </Tip>
                <Tip label="Fit all nodes into view" side="bottom">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => fitView({ padding: 0.15, duration: 400 })}
                  >
                    ⤢ fit
                  </Button>
                </Tip>
              </Panel>
              <ColumnBands columns={liveColumns} bandY={bandY} hoverPhaseId={hoverPhaseId} />
              <Background color={themeMode === 'dark' ? '#ffffff08' : '#00000012'} gap={24} />
              <Controls style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }} />
              <MiniMap
                nodeColor={n => NODE_COLORS[(n.data as VaultNodeData).type] ?? '#555'}
                maskColor={themeMode === 'dark' ? '#0d0d1aaa' : '#c9cedeaa'}
                style={{ background: 'var(--surface-deep)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}
              />
            </ReactFlow>
            <ColumnHeaders
              columns={liveColumns}
              nodeCounts={visiblePhaseCounts}
              onOpenPhaseManager={onOpenPhaseManager}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-card border-border">
          <ContextMenuItem
            className="text-xs"
            onClick={() => onRequestAddNode({ phaseId: phaseAt(columns, paneFlowPos.current.x) })}
          >
            ＋ Add node here
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <RelationPicker
        open={!!pendingConn}
        onSelect={handleRelationSelect}
        onCancel={() => setPendingConn(null)}
      />
    </>
  )
}

// Which phase column contains graph-x? Hit ranges extend halfway into the gaps.
function phaseAt(columns: ColumnBounds[], x: number): string | null {
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]
    const left = i === 0 ? -Infinity : col.x - 40
    const right = i === columns.length - 1 ? Infinity : col.x + col.width + 40
    if (x >= left && x <= right) return col.phaseId
  }
  return null
}
