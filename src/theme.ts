import {
  Target, FlaskConical, Factory,
  AlertTriangle, HelpCircle, FileCheck, TestTube, User, Building2, Coins, StickyNote,
  Lock, Unlock, Hourglass, CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import type { NodeType, AttachmentKind, ReadinessState } from '@/types'
import { READINESS_COLORS } from '@/types'

export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  goal:  Target,
  tech:  FlaskConical,
  asset: Factory,
}

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  goal:  'Goal',
  tech:  'Tech',
  asset: 'Asset',
}

export const ATTACHMENT_ICONS: Record<AttachmentKind, LucideIcon> = {
  risk:         AlertTriangle,
  assumption:   HelpCircle,
  evidence:     FileCheck,
  experiment:   TestTube,
  person:       User,
  organization: Building2,
  funding:      Coins,
  note:         StickyNote,
}

export const ATTACHMENT_KINDS: AttachmentKind[] = [
  'risk', 'assumption', 'evidence', 'experiment',
  'person', 'organization', 'funding', 'note',
]

export interface ReadinessMeta {
  icon: LucideIcon
  label: string
  description: string
  color: string
}

export const READINESS_META: Record<ReadinessState, ReadinessMeta> = {
  blocked: {
    icon: Lock, label: 'Blocked', color: READINESS_COLORS.blocked,
    description: 'Blocked — something this depends on is not done yet',
  },
  ready: {
    icon: Unlock, label: 'Ready', color: READINESS_COLORS.ready,
    description: 'Ready — every dependency is met, work can start',
  },
  'in-progress': {
    icon: Hourglass, label: 'In progress', color: READINESS_COLORS['in-progress'],
    description: 'In progress — currently being worked on',
  },
  done: {
    icon: CheckCircle2, label: 'Done', color: READINESS_COLORS.done,
    description: 'Done — completed and available to dependents',
  },
}
