'use client'

import { useMemo } from 'react'
import type { Person } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  personnel: Person[]
}

export default function PersonnelStats({ personnel }: Props) {
  const stats = useMemo(() => {
    const total = personnel.length
    const present = personnel.filter(p => p.status === 'present').length
    const absent = personnel.filter(p => p.status === 'absent').length
    const trip = personnel.filter(p => p.status === 'trip').length
    const leave = personnel.filter(p => p.status === 'leave').length

    return [
      { label: '总人数', value: total, color: 'text-foreground' },
      { label: '在位', value: present, color: 'text-[var(--status-present)]' },
      { label: '出差', value: trip, color: 'text-[var(--status-trip)]' },
      { label: '请假', value: leave, color: 'text-[var(--status-leave)]' },
      { label: '未到', value: absent, color: 'text-[var(--status-absent)]' },
    ]
  }, [personnel])

  return (
    <div className="flex flex-wrap gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-2">
          <span className={cn('text-2xl font-bold', stat.color)}>{stat.value}</span>
          <span className="text-sm text-muted-foreground">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}
