import { useState } from 'react'
import { ChevronUp, ChevronDown, Trash2, Plus } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore } from '@/store'

const SWATCHES = ['#d9a441', '#5b9dd9', '#4dab84', '#c95f6d', '#9b7ed9', '#5bc8c4']

interface PhaseManagerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function PhaseRow({ phaseId }: { phaseId: string }) {
  const phase       = useStore(s => s.phases.find(p => p.id === phaseId))
  const phaseCount  = useStore(s => s.phases.length)
  const nodeCount   = useStore(s => s.vaultNodes.filter(n => n.phaseId === phaseId).length)
  const updatePhase = useStore(s => s.updatePhase)
  const deletePhase = useStore(s => s.deletePhase)
  const movePhase   = useStore(s => s.movePhase)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [name, setName] = useState(phase?.name ?? '')

  if (!phase) return null
  const commitName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== phase.name) updatePhase(phase.id, { name: trimmed })
    else setName(phase.name)
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1.5">
      <div className="flex flex-col">
        <Button variant="ghost" size="sm" className="h-4 w-5 p-0" disabled={phase.order === 0}
          title="Move left" onClick={() => movePhase(phase.id, -1)}>
          <ChevronUp className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-4 w-5 p-0" disabled={phase.order === phaseCount - 1}
          title="Move right" onClick={() => movePhase(phase.id, 1)}>
          <ChevronDown className="w-3 h-3" />
        </Button>
      </div>
      <Input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="h-7 text-xs flex-1"
      />
      <div className="flex gap-1 shrink-0">
        {SWATCHES.map(c => (
          <button
            key={c}
            title="Set accent color"
            onClick={() => updatePhase(phase.id, { color: phase.color === c ? null : c })}
            style={{
              width: 14, height: 14, borderRadius: 4, background: c,
              outline: phase.color === c ? '2px solid white' : 'none',
              outlineOffset: 1,
            }}
          />
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0">
        {nodeCount} node{nodeCount === 1 ? '' : 's'}
      </span>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0 text-destructive hover:text-destructive"
        title="Delete phase"
        onClick={() => nodeCount > 0 ? setConfirmDelete(true) : deletePhase(phase.id)}>
        <Trash2 className="w-3 h-3" />
      </Button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete phase “{phase.name}”?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {nodeCount} node{nodeCount === 1 ? ' becomes' : 's become'} unassigned. No nodes are deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-7 text-xs" onClick={() => deletePhase(phase.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function PhaseManagerDialog({ open, onOpenChange }: PhaseManagerDialogProps) {
  const phases   = useStore(s => s.phases)
  const addPhase = useStore(s => s.addPhase)
  const sorted = [...phases].sort((a, b) => a.order - b.order)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm">Phases</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          {sorted.map(p => <PhaseRow key={p.id} phaseId={p.id} />)}
          {sorted.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No phases yet — nodes flow freely.</p>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 self-start"
          onClick={() => addPhase(`Phase ${sorted.length + 1}`)}>
          <Plus className="w-3 h-3" /> Add phase
        </Button>
      </DialogContent>
    </Dialog>
  )
}
