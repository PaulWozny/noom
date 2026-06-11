import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { temporal } from 'zundo'
import { shallow } from 'zustand/shallow'
import type { VaultNodeData, EdgeData, Phase } from '@/types'
import { migrateGraph } from '@/migrate'
import rawGraph from '@/data/graph.json'

interface GraphStore {
  vaultNodes: VaultNodeData[]
  vaultEdges: EdgeData[]
  phases: Phase[]

  fileHandle: FileSystemFileHandle | null
  isDirty: boolean

  // node/edge mutations
  updateNode: (id: string, patch: Partial<VaultNodeData>) => void
  deleteNode: (id: string) => void
  addNode:    (data: VaultNodeData) => void
  addEdge:    (edge: EdgeData) => void
  updateEdge: (id: string, patch: Partial<Omit<EdgeData, 'id'>>) => void
  deleteEdge: (id: string) => void

  // phase mutations
  addPhase:    (name: string) => void
  updatePhase: (id: string, patch: Partial<Omit<Phase, 'id'>>) => void
  deletePhase: (id: string) => void
  movePhase:   (id: string, dir: -1 | 1) => void

  // persistence
  openFile: () => Promise<void>
  saveFile: () => Promise<void>
}

function buildMeta(nodes: VaultNodeData[], edges: EdgeData[]) {
  return {
    generated: new Date().toISOString(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
  }
}

function newPhaseId(): string {
  return `p-${Math.random().toString(36).slice(2, 8)}`
}

const seed = migrateGraph(rawGraph)

// temporal (zundo) provides undo/redo over the graph data only — fileHandle and
// isDirty are excluded via partialize so undo can never clobber the file handle.
// Will be replaced by Y.UndoManager when the store moves to Yjs.
export const useStore = create<GraphStore>()(
  temporal(
    subscribeWithSelector((set, get) => ({
      vaultNodes: seed.nodes,
      vaultEdges: seed.edges,
      phases:     seed.phases,
      fileHandle: null,
      isDirty:    false,

      // ── node/edge mutations ───────────────────────────────────────────────
      updateNode: (id, patch) => {
        set(s => ({ vaultNodes: s.vaultNodes.map(n => n.id === id ? { ...n, ...patch } : n) }))
      },

      deleteNode: (id) => {
        set(s => ({
          vaultNodes: s.vaultNodes.filter(n => n.id !== id),
          vaultEdges: s.vaultEdges.filter(e => e.source !== id && e.target !== id),
        }))
      },

      addNode: (data) => {
        set(s => ({ vaultNodes: [...s.vaultNodes, data] }))
      },

      addEdge: (edge) => {
        set(s => ({ vaultEdges: [...s.vaultEdges, edge] }))
      },

      updateEdge: (id, patch) => {
        set(s => ({ vaultEdges: s.vaultEdges.map(e => e.id === id ? { ...e, ...patch } : e) }))
      },

      deleteEdge: (id) => {
        set(s => ({ vaultEdges: s.vaultEdges.filter(e => e.id !== id) }))
      },

      // ── phase mutations ───────────────────────────────────────────────────
      addPhase: (name) => {
        set(s => {
          const maxOrder = s.phases.reduce((m, p) => Math.max(m, p.order), -1)
          return {
            phases: [...s.phases, { id: newPhaseId(), name, order: maxOrder + 1, color: null, description: null }],
          }
        })
      },

      updatePhase: (id, patch) => {
        set(s => ({ phases: s.phases.map(p => p.id === id ? { ...p, ...patch } : p) }))
      },

      deletePhase: (id) => {
        set(s => ({
          phases: s.phases
            .filter(p => p.id !== id)
            .sort((a, b) => a.order - b.order)
            .map((p, i) => ({ ...p, order: i })),
          // unassign nodes — deleting a phase never deletes nodes
          vaultNodes: s.vaultNodes.map(n => n.phaseId === id ? { ...n, phaseId: null } : n),
        }))
      },

      movePhase: (id, dir) => {
        set(s => {
          const sorted = [...s.phases].sort((a, b) => a.order - b.order)
          const idx = sorted.findIndex(p => p.id === id)
          const swap = idx + dir
          if (idx < 0 || swap < 0 || swap >= sorted.length) return {}
          ;[sorted[idx], sorted[swap]] = [sorted[swap], sorted[idx]]
          return { phases: sorted.map((p, i) => ({ ...p, order: i })) }
        })
      },

      // ── persistence ───────────────────────────────────────────────────────
      openFile: async () => {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Graph JSON', accept: { 'application/json': ['.json'] } }],
        })
        const file = await handle.getFile()
        const migrated = migrateGraph(JSON.parse(await file.text()))
        set({
          vaultNodes: migrated.nodes,
          vaultEdges: migrated.edges,
          phases:     migrated.phases,
          fileHandle: handle,
          isDirty:    false,
        })
        // a freshly opened file is not an undoable edit
        useStore.temporal.getState().clear()
      },

      saveFile: async () => {
        const handle = get().fileHandle
        if (!handle) return
        const { vaultNodes, vaultEdges, phases } = get()
        const payload = JSON.stringify(
          { nodes: vaultNodes, edges: vaultEdges, phases, meta: buildMeta(vaultNodes, vaultEdges) },
          null, 2
        )
        const writable = await handle.createWritable()
        await writable.write(payload)
        await writable.close()
        set({ isDirty: false })
      },
    })),
    {
      partialize: s => ({ vaultNodes: s.vaultNodes, vaultEdges: s.vaultEdges, phases: s.phases }),
      // without this, every setState (incl. isDirty bookkeeping) would push a
      // duplicate history entry — only record when graph data actually changed
      equality: (past, current) =>
        past.vaultNodes === current.vaultNodes &&
        past.vaultEdges === current.vaultEdges &&
        past.phases === current.phases,
      limit: 100,
    }
  )
)

// Debounced autosave: any graph change (mutations AND undo/redo) marks dirty
// and schedules a save — mutations themselves stay persistence-free.
let saveTimer: ReturnType<typeof setTimeout> | null = null
useStore.subscribe(
  s => [s.vaultNodes, s.vaultEdges, s.phases] as const,
  () => {
    useStore.setState({ isDirty: true })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      useStore.getState().saveFile().catch(console.error)
    }, 500)
  },
  { equalityFn: shallow }
)

export const undo = () => useStore.temporal.getState().undo()
export const redo = () => useStore.temporal.getState().redo()
