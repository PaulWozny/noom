import { RELATION_COLORS, RELATION_LABELS, type RelationType } from '@/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const RELATIONS = Object.keys(RELATION_COLORS) as RelationType[]

interface RelationPickerProps {
  open: boolean
  onSelect: (relation: RelationType) => void
  onCancel: () => void
}

export function RelationPicker({ open, onSelect, onCancel }: RelationPickerProps) {
  return (
    <Dialog open={open} onOpenChange={open => { if (!open) onCancel() }}>
      <DialogContent className="max-w-xs bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm">Choose relation type</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          {RELATIONS.map(rel => (
            <Button
              key={rel}
              variant="ghost"
              size="sm"
              className="justify-start text-xs h-8 px-3 gap-2"
              onClick={() => onSelect(rel)}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: RELATION_COLORS[rel] }}
              />
              {RELATION_LABELS[rel]}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
