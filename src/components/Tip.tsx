import type { ReactNode } from 'react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

// Delayed, styled tooltip. Delay comes from the app-level TooltipProvider
// (App.tsx) so all tooltips feel consistent and non-intrusive.
export function Tip({ label, side, children }: {
  label: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}) {
  if (!label) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side ?? 'top'} className="max-w-[260px] text-xs px-2 py-1">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
