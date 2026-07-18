'use client'

import type { Person } from '@/lib/types'
import { PersonPicker } from '@/components/admin/person-picker'

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

/**
 * Searchable person-picker for workstation assignment. Thin wrapper over the
 * shared PersonPicker kept for its workstation-specific prop names/semantics
 * (the "unassigned" placeholder).
 */
export function WorkstationAssigner({ value, personnel, onChange, disabled }: WorkstationAssignerProps) {
  return (
    <PersonPicker
      value={value}
      personnel={personnel}
      onChange={onChange}
      disabled={disabled}
      placeholder="未分配"
      className="w-full"
    />
  )
}
