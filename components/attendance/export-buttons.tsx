'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Download, FileSpreadsheet } from 'lucide-react'
import { monthStart, todayDateStr } from '@/lib/attendance'

/**
 * Export controls for the attendance page. A from/to date range plus two
 * download buttons (per-day detail, per-person summary). Both endpoints take
 * the same params; non-admins are scoped to themselves server-side, so the
 * optional personId is only meaningful for admins.
 */
export function ExportButtons({ personId }: { personId?: string }) {
  const today = todayDateStr()
  const [from, setFrom] = useState(monthStart(today))
  const [to, setTo] = useState(today)

  const buildUrl = (kind: 'detail' | 'summary') => {
    const p = new URLSearchParams({ from, to })
    if (personId) p.set('personId', personId)
    return `/api/attendance/export/${kind}?${p.toString()}`
  }

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">开始日期</label>
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-40 text-sm" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">结束日期</label>
        <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-40 text-sm" />
      </div>
      <Button size="sm" variant="outline" className="h-8 gap-1.5" asChild disabled={!valid}>
        <a href={buildUrl('detail')} download>
          <Download className="h-3.5 w-3.5" />
          导出明细
        </a>
      </Button>
      <Button size="sm" variant="outline" className="h-8 gap-1.5" asChild disabled={!valid}>
        <a href={buildUrl('summary')} download>
          <FileSpreadsheet className="h-3.5 w-3.5" />
          导出汇总
        </a>
      </Button>
    </div>
  )
}
