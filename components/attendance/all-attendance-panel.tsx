'use client'

import { useState, useMemo } from 'react'
import { usePersonnel, useAttendanceRecords } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PersonPicker } from '@/components/admin/person-picker'
import { ExportButtons } from '@/components/attendance/export-buttons'
import { TripHoursSetting } from '@/components/attendance/trip-hours-setting'
import { formatWorkHours } from '@/lib/attendance'
import { cn } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'

const statusConfig: Record<string, { label: string; badge: string }> = {
  present: { label: '在位', badge: 'bg-[var(--status-present)]/15 text-[var(--status-present)] border-[var(--status-present)]/30' },
  trip:    { label: '出差', badge: 'bg-[var(--status-trip)]/15 text-[var(--status-trip)] border-[var(--status-trip)]/30' },
  leave:   { label: '请假', badge: 'bg-[var(--status-leave)]/15 text-[var(--status-leave)] border-[var(--status-leave)]/30' },
  absent:  { label: '未到', badge: 'bg-[var(--status-absent)]/15 text-[var(--status-absent)] border-[var(--status-absent)]/30' },
}

export function AllAttendancePanel() {
  const { data: personnelResp } = usePersonnel({ pageSize: 1000 })
  const personnel = personnelResp?.data?.items ?? []
  const [selectedId, setSelectedId] = useState<string>('')
  const [backfillDate, setBackfillDate] = useState('')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string | null>(null)

  const sortedPersonnel = useMemo(
    () => [...personnel].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    [personnel],
  )

  const effectiveId = selectedId || sortedPersonnel[0]?.id || ''
  const { data, isLoading } = useAttendanceRecords(
    effectiveId ? { personId: effectiveId, pageSize: 60 } : null,
  )
  const page = data?.data

  async function handleBackfill() {
    if (!backfillDate || backfilling) return
    setBackfilling(true)
    setBackfillResult(null)
    try {
      const r = await fetch(`/api/attendance/backfill?date=${backfillDate}`, { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `补拉失败 (${r.status})`)
      setBackfillResult(`已补拉 ${backfillDate}：${data.data?.upserted ?? 0} 人`)
    } catch (e) {
      setBackfillResult(e instanceof Error ? e.message : '补拉失败')
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">导出考勤数据</CardTitle>
            <p className="text-xs text-muted-foreground">
              导出全员（或选单人）的逐日明细 / 汇总（CSV）。下方选择人员则导出该人员。
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <ExportButtons personId={selectedId || undefined} />
          </CardContent>
        </Card>
        <TripHoursSetting />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">补拉历史考勤</CardTitle>
          <p className="text-xs text-muted-foreground">
            诊断用：当某天的考勤数据缺失或异常时，输入日期从钉钉重新拉取。不影响 finalize 水位线。
          </p>
        </CardHeader>
        <CardContent className="pt-0 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">日期</label>
            <Input
              type="date"
              value={backfillDate}
              onChange={e => setBackfillDate(e.target.value)}
              className="h-8 w-40 text-sm"
            />
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={handleBackfill} disabled={!backfillDate || backfilling}>
            <RefreshCw className={cn('h-3.5 w-3.5', backfilling && 'animate-spin')} />
            {backfilling ? '补拉中…' : '补拉'}
          </Button>
          {backfillResult && (
            <span className={cn(
              'text-xs',
              backfillResult.startsWith('已补拉') ? 'text-[var(--status-present)]' : 'text-destructive',
            )}>
              {backfillResult}
            </span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center gap-3">
          <CardTitle className="text-sm">人员考勤明细</CardTitle>
          <PersonPicker
            value={effectiveId}
            personnel={sortedPersonnel}
            onChange={(id) => setSelectedId(id ?? '')}
            placeholder="选择人员"
            className="w-48"
          />
        </CardHeader>
        <CardContent className="pt-0">
          {!effectiveId ? (
            <p className="text-sm text-muted-foreground py-8 text-center">暂无人员</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : (page?.items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">该人员暂无考勤记录</p>
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
                  {(page?.items ?? []).map(r => (
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
        </CardContent>
      </Card>
    </div>
  )
}
