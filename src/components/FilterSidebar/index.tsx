import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { NodeType, StatusType } from '@/types'
import { NODE_COLORS, STATUS_COLORS } from '@/types'
import { NODE_TYPE_LABELS } from '@/theme'

const ALL_TYPES: NodeType[] = ['goal', 'tech', 'asset']

export interface FilterState {
  types: Set<NodeType>
  statuses: Set<StatusType>
  trlMin: number
  trlMax: number
  focusNeighborhood: boolean
}

export function defaultFilters(availableStatuses: StatusType[]): FilterState {
  return {
    types: new Set(ALL_TYPES),
    statuses: new Set(availableStatuses),
    trlMin: 1,
    trlMax: 9,
    focusNeighborhood: false,
  }
}

interface FilterSidebarProps {
  filters: FilterState
  availableStatuses: StatusType[]
  onChange: (f: FilterState) => void
}

function toggle<T>(set: Set<T>, val: T): Set<T> {
  const next = new Set(set)
  next.has(val) ? next.delete(val) : next.add(val)
  return next
}

export function FilterSidebar({ filters, availableStatuses, onChange }: FilterSidebarProps) {
  return (
    <aside className="flex flex-col w-[220px] shrink-0 bg-card border-r border-border overflow-y-auto py-2.5 gap-0">

      {/* Node Types */}
      <section className="px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Node Types</p>
        {ALL_TYPES.map(t => (
          <div key={t} className="flex items-center gap-1.5 py-0.5">
            <Checkbox
              id={`type-${t}`}
              checked={filters.types.has(t)}
              onCheckedChange={() => onChange({ ...filters, types: toggle(filters.types, t) })}
            />
            <span className="size-2 rounded-full shrink-0" style={{ background: NODE_COLORS[t] }} />
            <Label htmlFor={`type-${t}`} className="text-xs cursor-pointer">{NODE_TYPE_LABELS[t]}</Label>
          </div>
        ))}
      </section>

      <Separator className="bg-border" />

      {/* Status */}
      <section className="px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Status</p>
        {availableStatuses.map(s => (
          <div key={s} className="flex items-center gap-1.5 py-0.5">
            <Checkbox
              id={`status-${s}`}
              checked={filters.statuses.has(s)}
              onCheckedChange={() => onChange({ ...filters, statuses: toggle(filters.statuses, s) })}
            />
            <span className="size-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[s] ?? '#555' }} />
            <Label htmlFor={`status-${s}`} className="text-xs cursor-pointer">{s}</Label>
          </div>
        ))}
      </section>

      <Separator className="bg-border" />

      {/* TRL Range */}
      <section className="px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
          TRL Range
          <span className="text-muted-foreground/50 ml-1 font-normal normal-case tracking-normal">
            {filters.trlMin}–{filters.trlMax}
          </span>
        </p>
        <div className="flex flex-col gap-3 mt-2">
          <div>
            <span className="text-[10px] text-muted-foreground/60 block mb-1">Min</span>
            <Slider
              min={1} max={9} step={1}
              value={[filters.trlMin]}
              onValueChange={([v]) => onChange({ ...filters, trlMin: Math.min(v, filters.trlMax) })}
              className="w-full"
            />
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground/60 block mb-1">Max</span>
            <Slider
              min={1} max={9} step={1}
              value={[filters.trlMax]}
              onValueChange={([v]) => onChange({ ...filters, trlMax: Math.max(v, filters.trlMin) })}
              className="w-full"
            />
          </div>
        </div>
      </section>

      <Separator className="bg-border" />

      {/* Options */}
      <section className="px-3 py-2">
        <div className="flex items-center gap-1.5 py-0.5">
          <Checkbox
            id="focus-hood"
            checked={filters.focusNeighborhood}
            onCheckedChange={v => onChange({ ...filters, focusNeighborhood: !!v })}
          />
          <Label htmlFor="focus-hood" className="text-xs cursor-pointer">Strong chain focus</Label>
        </div>
      </section>

      <Separator className="bg-border" />

      {/* Reset */}
      <section className="px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-7"
          onClick={() => onChange(defaultFilters(availableStatuses))}
        >
          Reset all
        </Button>
      </section>

    </aside>
  )
}
