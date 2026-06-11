import { useState, useMemo, useCallback, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useStore as useZustandStore } from 'zustand'
import { Undo2, Redo2, Columns3 } from 'lucide-react'

import { Graph, type AddNodePrefill } from '@/components/Graph'
import { DetailPanel } from '@/components/DetailPanel'
import { FilterSidebar, defaultFilters, type FilterState } from '@/components/FilterSidebar'
import { SearchBar } from '@/components/SearchBar'
import { AddNodeModal } from '@/components/AddNodeModal'
import { PhaseManagerDialog } from '@/components/PhaseManagerDialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Tip } from '@/components/Tip'
import { Button } from '@/components/ui/button'
import type { StatusType, RelationType, VaultNodeData } from '@/types'
import { trlColor } from '@/components/DetailPanel/TrlBar'
import { computeReadiness } from '@/derived'
import { useStore, undo, redo } from '@/store'

export default function App() {
  const vaultNodes  = useStore(s => s.vaultNodes)
  const vaultEdges  = useStore(s => s.vaultEdges)
  const phases      = useStore(s => s.phases)
  const fileHandle  = useStore(s => s.fileHandle)
  const isDirty     = useStore(s => s.isDirty)
  const openFile    = useStore(s => s.openFile)
  const addNode     = useStore(s => s.addNode)
  const addEdge     = useStore(s => s.addEdge)
  const updateNode  = useStore(s => s.updateNode)

  const canUndo = useZustandStore(useStore.temporal, s => s.pastStates.length > 0)
  const canRedo = useZustandStore(useStore.temporal, s => s.futureStates.length > 0)

  const [addNodePrefill, setAddNodePrefill] = useState<AddNodePrefill | null>(null)
  const [showAddNode, setShowAddNode] = useState(false)
  const [showPhaseManager, setShowPhaseManager] = useState(false)

  // global undo/redo shortcuts — skipped while typing
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const availableStatuses = useMemo(
    () => [...new Set(vaultNodes.map(n => n.status))] as StatusType[],
    [vaultNodes]
  )

  const [filters, setFilters] = useState<FilterState>(() => defaultFilters(availableStatuses))
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const readiness = useMemo(
    () => computeReadiness(vaultNodes, vaultEdges),
    [vaultNodes, vaultEdges]
  )

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const n of vaultNodes) {
      if (!filters.types.has(n.type)) continue
      if (!filters.statuses.has(n.status)) continue
      if (n.trl != null && (n.trl < filters.trlMin || n.trl > filters.trlMax)) continue
      ids.add(n.id)
    }
    return ids
  }, [filters, vaultNodes])

  const visibleCount = visibleNodeIds.size
  const visibleEdgeCount = useMemo(
    () => vaultEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)).length,
    [visibleNodeIds, vaultEdges]
  )

  const projectTrl = useMemo(() => {
    const trls = vaultNodes
      .filter(n => n.type === 'tech' && n.status === 'active' && n.trl != null && visibleNodeIds.has(n.id))
      .map(n => n.trl as number)
    return trls.length > 0 ? Math.min(...trls) : null
  }, [visibleNodeIds, vaultNodes])

  const selectedNode = useMemo(
    () => vaultNodes.find(n => n.id === selectedId) ?? null,
    [selectedId, vaultNodes]
  )

  const handleSelectNode = useCallback((id: string | null) => setSelectedId(id), [])
  const handleJumpTo     = useCallback((id: string) => setSelectedId(id), [])

  const handleRequestAddNode = useCallback((prefill: AddNodePrefill) => {
    setAddNodePrefill(prefill)
    setShowAddNode(true)
  }, [])

  const handleAddNode = useCallback((data: VaultNodeData, connect?: { sourceId: string; relation: RelationType }) => {
    addNode(data)
    if (connect) {
      addEdge({
        id: `${connect.sourceId}-${data.id}-${connect.relation}-${Date.now()}`,
        source: connect.sourceId,
        target: data.id,
        relation: connect.relation,
      })
    }
    setShowAddNode(false)
    setAddNodePrefill(null)
  }, [addNode, addEdge])

  return (
    <TooltipProvider delayDuration={600} skipDelayDuration={250}>
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <span className="logo-icon">◈</span>
          Lunar Roadmap
        </div>
        <SearchBar nodes={vaultNodes} onSelect={handleJumpTo} />
        <div className="flex items-center gap-2 ml-auto mr-2">
          <Tip label="Undo (Ctrl+Z)" side="bottom">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
              disabled={!canUndo} onClick={() => undo()}>
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
          </Tip>
          <Tip label="Redo (Ctrl+Shift+Z)" side="bottom">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
              disabled={!canRedo} onClick={() => redo()}>
              <Redo2 className="w-3.5 h-3.5" />
            </Button>
          </Tip>
          {/* File status */}
          <Tip side="bottom" label={fileHandle
            ? (isDirty ? 'Changes not yet written to the opened file' : 'All changes saved to the opened file')
            : 'No file opened — changes live only in this tab. Use "open" to enable autosave.'}>
            <span className="text-[11px] cursor-default" style={{ color: isDirty ? '#e0913f' : '#48b27a' }}>
              {fileHandle
                ? (isDirty ? '● unsaved' : '✓ saved')
                : '○ no file'
              }
            </span>
          </Tip>
          <Tip label="Open a graph.json file — edits then autosave to it" side="bottom">
            <Button
              variant="outline" size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => openFile().catch(console.error)}
            >
              open
            </Button>
          </Tip>
          <Tip label="Manage phases: rename, reorder, recolor, add, delete" side="bottom">
            <Button
              variant="outline" size="sm"
              className="h-6 text-[11px] px-2 gap-1"
              onClick={() => setShowPhaseManager(true)}
            >
              <Columns3 className="w-3 h-3" /> phases
            </Button>
          </Tip>
          <Tip label="Add a new node (or right-click the canvas where you want it)" side="bottom">
            <Button
              variant="outline" size="sm"
              className="h-6 text-[11px] px-2 gap-1"
              onClick={() => { setAddNodePrefill(null); setShowAddNode(true) }}
            >
              ＋ node
            </Button>
          </Tip>
        </div>
      </header>

      {/* Main area */}
      <div className="main-area">
        <FilterSidebar
          filters={filters}
          availableStatuses={availableStatuses}
          onChange={setFilters}
        />

        <div className="graph-container">
          <ReactFlowProvider>
            <Graph
              allNodes={vaultNodes}
              allEdges={vaultEdges}
              phases={phases}
              readiness={readiness}
              visibleNodeIds={visibleNodeIds}
              selectedId={selectedId}
              focusNeighborhood={filters.focusNeighborhood}
              onSelectNode={handleSelectNode}
              onRequestAddNode={handleRequestAddNode}
              onOpenPhaseManager={() => setShowPhaseManager(true)}
            />
          </ReactFlowProvider>
        </div>
      </div>

      {/* Detail panel */}
      <Sheet open={!!selectedNode} modal={false} onOpenChange={open => { if (!open) setSelectedId(null) }}>
        <SheetContent
          side="right"
          className="w-[460px] p-0 bg-card border-l border-border flex flex-col gap-0 overflow-hidden"
          // canvas interactions (toolbar menus, drags) must not dismiss the
          // panel — deselection is handled explicitly by onPaneClick
          onInteractOutside={e => e.preventDefault()}
        >
          {selectedNode && (
            <DetailPanel
              node={selectedNode}
              allNodes={vaultNodes}
              allEdges={vaultEdges}
              phases={phases}
              readiness={readiness.get(selectedNode.id)}
              onJumpTo={handleJumpTo}
              onSaveNode={(id, patch) => updateNode(id, patch)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add node modal */}
      <AddNodeModal
        open={showAddNode}
        phases={phases}
        prefill={addNodePrefill}
        onAdd={handleAddNode}
        onCancel={() => { setShowAddNode(false); setAddNodePrefill(null) }}
      />

      {/* Phase manager */}
      <PhaseManagerDialog open={showPhaseManager} onOpenChange={setShowPhaseManager} />

      {/* Status bar */}
      <footer className="statusbar">
        <span>{visibleCount}/{vaultNodes.length} nodes · {visibleEdgeCount}/{vaultEdges.length} edges</span>
        {selectedNode && (
          <span>
            · selected: <strong>{selectedNode.label}</strong>
            {' '}({selectedNode.type}{selectedNode.trl != null ? `, TRL ${selectedNode.trl}` : ''})
          </span>
        )}
        {projectTrl != null && (
          <span style={{ marginLeft: 'auto', marginRight: 8 }}>
            Project TRL:{' '}
            <span style={{ color: trlColor(projectTrl), fontWeight: 700 }}>
              ● {projectTrl}
            </span>
          </span>
        )}
      </footer>
    </div>
    </TooltipProvider>
  )
}
