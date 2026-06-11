import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { temporal } from 'zundo'
import { shallow } from 'zustand/shallow'
import type { VaultNodeData, EdgeData, Phase } from '@/types'
import { migrateGraph, type MigratedGraph } from '@/migrate'
import rawGraph from '@/data/graph.json'

// Persistence model: every change is autosaved to localStorage (works in any
// browser, survives closing the tab immediately). Files exist only as
// explicit export/import. Will be replaced by Yjs + IndexedDB later.
const STORAGE_KEY = 'lunar-roadmap:graph:v1'

interface GraphStore {
  vaultNodes: VaultNodeData[]
  vaultEdges: EdgeData[]
  phases: Phase[]

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

  // file exchange + resets
  exportJson:  () => void
  importJson:  (file: File) => Promise<void>
  resetToSeed: () => void
  newBlank:    () => void
}

function newPhaseId(): string {
  return `p-${Math.random().toString(36).slice(2, 8)}`
}

function loadInitial(): MigratedGraph {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return migrateGraph(JSON.parse(saved))
  } catch (err) {
    console.error('Could not load the saved roadmap — falling back to the demo seed', err)
  }
  return migrateGraph(rawGraph)
}

// Minimal scaffold for "start blank": two phases, two connected nodes
function blankGraph(): MigratedGraph {
  const node = (partial: Partial<VaultNodeData> & Pick<VaultNodeData, 'id' | 'label' | 'type' | 'status' | 'phaseId' | 'body'>): VaultNodeData => ({
    trl: null, tags: [], path: '', cost: null, budget: null,
    duration: null, deadline: null, attachments: [],
    ...partial,
  })
  return {
    phases: [
      { id: 'phase-1', name: 'Phase 1', order: 0, color: null, description: null },
      { id: 'phase-2', name: 'Phase 2', order: 1, color: null, description: null },
    ],
    nodes: [
      node({
        id: 'first-step', label: 'First Step', type: 'tech', status: 'active', phaseId: 'phase-1',
        body: 'Rename me — this is your first building block.',
      }),
      node({
        id: 'the-goal', label: 'The Goal', type: 'goal', status: 'planned', phaseId: 'phase-2',
        body: 'What are you building towards?',
      }),
    ],
    edges: [{ id: 'e-first', source: 'first-step', target: 'the-goal', relation: 'flow' }],
  }
}

const seed = loadInitial()

// temporal (zundo) provides undo/redo over the graph data.
// Will be replaced by Y.UndoManager when the store moves to Yjs.
export const useStore = create<GraphStore>()(
  temporal(
    subscribeWithSelector((set, get) => {
      // replace the whole graph (import/reset/blank) — not an undoable edit
      const loadGraph = (g: MigratedGraph) => {
        set({ vaultNodes: g.nodes, vaultEdges: g.edges, phases: g.phases })
        useStore.temporal.getState().clear()
      }

      return {
      vaultNodes: seed.nodes,
      vaultEdges: seed.edges,
      phases:     seed.phases,

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

      // ── file exchange + resets ────────────────────────────────────────────
      exportJson: () => {
        const { vaultNodes, vaultEdges, phases } = get()
        const payload = JSON.stringify({
          nodes: vaultNodes,
          edges: vaultEdges,
          phases,
          meta: { generated: new Date().toISOString(), nodeCount: vaultNodes.length, edgeCount: vaultEdges.length },
        }, null, 2)
        const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url
        a.download = 'lunar-roadmap.json'
        a.click()
        URL.revokeObjectURL(url)
      },

      importJson: async (file) => {
        loadGraph(migrateGraph(JSON.parse(await file.text())))
      },

      resetToSeed: () => {
        loadGraph(migrateGraph(rawGraph))
      },

      newBlank: () => {
        loadGraph(blankGraph())
      },
    }}),
    {
      partialize: s => ({ vaultNodes: s.vaultNodes, vaultEdges: s.vaultEdges, phases: s.phases }),
      // only record history when graph data actually changed
      equality: (past, current) =>
        past.vaultNodes === current.vaultNodes &&
        past.vaultEdges === current.vaultEdges &&
        past.phases === current.phases,
      limit: 100,
    }
  )
)

// Debounced autosave to localStorage: every graph change (mutations, undo/redo,
// imports, resets) is persisted — closing the tab immediately is always safe.
let saveTimer: ReturnType<typeof setTimeout> | null = null
useStore.subscribe(
  s => [s.vaultNodes, s.vaultEdges, s.phases] as const,
  ([nodes, edges, phases]) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges, phases }))
      } catch (err) {
        console.error('Autosave to localStorage failed', err)
      }
    }, 300)
  },
  { equalityFn: shallow }
)

export const undo = () => useStore.temporal.getState().undo()
export const redo = () => useStore.temporal.getState().redo()
