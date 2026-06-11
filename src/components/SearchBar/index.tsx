import { useState } from 'react'
import {
  Command, CommandInput, CommandList,
  CommandItem, CommandEmpty, CommandGroup,
} from '@/components/ui/command'
import type { VaultNodeData } from '@/types'
import { NODE_COLORS } from '@/types'

interface SearchBarProps {
  nodes: VaultNodeData[]
  onSelect: (id: string) => void
}

export function SearchBar({ nodes, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('')

  const matches = query.trim().length > 0
    ? nodes.filter(n => n.label.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : []

  return (
    <div className="relative flex-1 max-w-xs">
      <Command shouldFilter={false} className="overflow-visible border border-border bg-card rounded-md">
        <CommandInput
          placeholder="Search nodes…"
          value={query}
          onValueChange={setQuery}
          className="h-8 text-xs py-0"
        />
        {query.trim() && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            <CommandList>
              <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                No nodes found.
              </CommandEmpty>
              {matches.length > 0 && (
                <CommandGroup>
                  {matches.map(n => (
                    <CommandItem
                      key={n.id}
                      value={n.id}
                      onSelect={() => { onSelect(n.id); setQuery('') }}
                      className="flex items-center gap-2 text-xs cursor-pointer px-3 py-1.5"
                    >
                      <span
                        className="size-2 rounded-full shrink-0"
                        style={{ background: NODE_COLORS[n.type] ?? '#555' }}
                      />
                      <span className="flex-1">{n.label}</span>
                      <span className="text-[9px] text-muted-foreground">{n.type}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </div>
        )}
      </Command>
    </div>
  )
}
