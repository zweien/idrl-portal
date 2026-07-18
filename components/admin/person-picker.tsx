'use client'

import { useState } from 'react'
import type { Person } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { Check, ChevronsUpDown, UserX } from 'lucide-react'

interface PersonPickerProps {
  /** Current personId (null/undefined = none selected). */
  value?: string | null
  /** All selectable people. */
  personnel: Person[]
  /** Called with the chosen personId, or null to clear. */
  onChange: (personId: string | null) => void
  /** Disable the control (e.g. no personnel loaded). */
  disabled?: boolean
  /** Label shown when no one is selected. */
  placeholder?: string
  className?: string
}

/**
 * Searchable person-picker (Popover + Command/cmdk). Lets admins type a name
 * to filter among many people instead of scrolling a native Select. Shared by
 * workstation assignment and user→person linking.
 */
export function PersonPicker({
  value,
  personnel,
  onChange,
  disabled,
  placeholder = '未关联',
  className,
}: PersonPickerProps) {
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
          className={cn('h-8 text-sm justify-between font-normal', className)}
          disabled={disabled || sorted.length === 0}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.name : placeholder}
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
                <span className="text-muted-foreground">{placeholder}</span>
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
