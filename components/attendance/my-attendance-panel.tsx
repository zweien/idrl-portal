'use client'

import { useAttendanceRecords } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExportButtons } from '@/components/attendance/export-buttons'
import { formatWorkHours } from '@/lib/attendance'
import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; badge: string }> = {
  present: { label: '在位', badge: 'bg-[var(--status-present)]/15 text-[var(--status-present)] border-[var(--status-present)]/30' },
  trip:    { label: '出差', badge: 'bg-[var(--status-trip)]/15 text-[var(--status-trip)] border-[var(--status-trip)]/30' },
  leave:   { label: '请假', badge: 'bg-[var(--status-leave)]/15 text-[var(--status-leave)] border-[var(--status-leave)]/30' },
  absent:  { label: '未到', badge: 'bg-[var(--status-absent)]/15 text-[var(--status-absent)] border-[var(--status-absent)]/30' },
}

export function MyAttendancePanel() {
  const { data, isLoading, error } = useAttendanceRecords({ pageSize: 60 })
  const page = data?.data

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>
  }
  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {error.message || '无法加载考勤记录'}
          <p className="text-xs mt-1">请确认你的账号已关联人员信息</p>
        </CardContent>
      </Card>
    )
  }

  const items = page?.items ?? []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">导出我的考勤</CardTitle>
          <p className="text-xs text-muted-foreground">选择日期范围，导出逐日明细或汇总（CSV）。</p>
        </CardHeader>
        <CardContent className="pt-0">
          <ExportButtons />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">我的打卡明细</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">暂无记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left font-medium py-2 px-2">日期</th>
                  <th className="text-left font-medium py-2 px-2">上班</th>
                  <th className="text-left font-medium py-2 px-2">下班</th>
                  <th className="text-left font-medium py-2 px-2">工时</th>
                  <th className="text-left font-medium py-2 px-2">状态</th>
                </tr>
              </thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="py-2 px-2 tabular-nums">{r.date}</td>
                    <td className="py-2 px-2 tabular-nums text-muted-foreground">{r.checkIn ?? '—'}</td>
                    <td className="py-2 px-2 tabular-nums text-muted-foreground">{r.checkOut ?? '—'}</td>
                    <td className="py-2 px-2 tabular-nums">{formatWorkHours(r.workMinutes)}</td>
                    <td className="py-2 px-2">
                      <Badge variant="outline" className={cn('text-xs font-normal border', statusConfig[r.status]?.badge)}>
                        {statusConfig[r.status]?.label ?? r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page && page.totalPages > 1 && (
          <p className="text-xs text-muted-foreground mt-3">
            第 {page.page} / {page.totalPages} 页 · 共 {page.total} 条
          </p>
        )}
        </CardContent>
      </Card>
    </div>
  )
}
