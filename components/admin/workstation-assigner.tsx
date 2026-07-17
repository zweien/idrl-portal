'use client'

import { useState } from 'react'
import type { Person } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, ChevronsUpDown, UserX } from 'lucide-react'

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
 * Searchable person-picker for workstation assignment. Uses Popover + Command
 * (cmdk) so admins can type a name to filter among 90+ people instead of
 * scrolling a native Select.
 */
export function WorkstationAssigner({ value, personnel, onChange, disabled }: WorkstationAssignerProps) {
  const [open, setOpen] = useState(false)
  const sorted = [...personnel].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  const selected = sorted.find(p => p.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 text-sm justify-between w-full font-normal"
          disabled={disabled || sorted.length === 0}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.name : '未分配'}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="搜索姓名…" />
          <CommandList>
            <CommandEmpty>未找到匹配人员</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => { onChange(null); setOpen(false) }}
                className="gap-2"
              >
                <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">未分配</span>
              </CommandItem>
              {sorted.map(p => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => { onChange(p.id); setOpen(false) }}
                  className="gap-2"
                >
                  <Check className={cn('h-3.5 w-3.5', value === p.id ? 'opacity-100' : 'opacity-0')} />
                  {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
