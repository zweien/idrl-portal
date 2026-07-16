'use client'

import type { Person } from '@/lib/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface WorkstationAssignerProps {
  /** Current personId of the workstation (null/undefined = unassigned). */
  value?: string | null
  /** All selectable people. */
  personnel: Person[]
  /** Called with the chosen personId, or null to unassign. */
  onChange: (personId: string | null) => void
  /** Disable the control (e.g. no personnel loaded). */
  disabled?: boolean
}

const UNASSIGNED = '__none__'

/**
 * Person-picker for workstation assignment. Lists people by name; selecting
 * the "未分配" option clears the assignment (onChange(null)).
 */
export function WorkstationAssigner({ value, personnel, onChange, disabled }: WorkstationAssignerProps) {
  const sorted = [...personnel].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))

  return (
    <Select
      value={value ?? UNASSIGNED}
      onValueChange={v => onChange(v === UNASSIGNED ? null : v)}
      disabled={disabled || sorted.length === 0}
    >
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder="未分配" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>未分配</SelectItem>
        {sorted.map(p => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
