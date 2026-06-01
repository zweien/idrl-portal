'use client'

import { useMemo } from 'react'
import { mockPersonnel } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

export default function PersonnelStats() {
  const stats = useMemo(() => {
    const total = mockPersonnel.length
    const online = mockPersonnel.filter(p => p.status === 'online').length
    const busy = mockPersonnel.filter(p => p.status === 'busy').length
    const offline = mockPersonnel.filter(p => p.status === 'offline').length
    const leave = mockPersonnel.filter(p => p.status === 'leave').length

    return [
      { label: '总人数', value: total, color: 'text-foreground' },
      { label: '在位', value: online, color: 'text-[oklch(0.7_0.2_145)]' },
      { label: '忙碌', value: busy, color: 'text-[oklch(0.65_0.2_45)]' },
      { label: '离开', value: offline, color: 'text-muted-foreground' },
      { label: '请假', value: leave, color: 'text-[oklch(0.5_0.15_300)]' },
    ]
  }, [])

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
