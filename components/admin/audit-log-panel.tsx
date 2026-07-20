'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuditLogs } from '@/lib/api'
import type { AuditLog } from '@/lib/types'
import { cn } from '@/lib/utils'

const TARGET_TYPES = ['user', 'apikey', 'news', 'resource', 'person', 'category', 'settings', 'floor-layout', 'backup', 'admin-data']

// Actions that are destructive/high-risk get a red badge.
const HIGH_RISK = new Set(['news.delete', 'resource.delete', 'person.delete', 'category.delete', 'apikey.revoke', 'backup.restore', 'backup.upload', 'admin-data.replace', 'user.update'])

export function AuditLogPanel() {
  const [page, setPage] = useState(1)
  const [actorId, setActorId] = useState('')
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')

  const params: Record<string, string | number> = { page, pageSize: 50 }
  if (actorId) params.actorId = actorId
  if (action) params.action = action
  if (targetType) params.targetType = targetType

  const { data, isLoading } = useAuditLogs(params)
  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const totalPages = data?.data?.totalPages ?? 1

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-medium">操作日志</p>
        <p className="text-xs text-muted-foreground mt-0.5">审计追踪：谁在何时做了什么操作。</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="操作者 id…"
          value={actorId}
          onChange={e => { setActorId(e.target.value); setPage(1) }}
          className="h-8 text-xs w-40"
        />
        <Input
          placeholder="动作（如 news.delete）…"
          value={action}
          onChange={e => { setAction(e.target.value); setPage(1) }}
          className="h-8 text-xs w-48"
        />
        <Select value={targetType || '__all__'} onValueChange={v => { setTargetType(v === '__all__' ? '' : v); setPage(1) }}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="对象类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全部对象</SelectItem>
            {TARGET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{total} 条</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-10 text-center">加载中…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">暂无日志</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">时间</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">操作者</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">动作</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">摘要</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map(l => (
                <tr key={l.id} className="hover:bg-muted/30">
                  <td className="py-2 px-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString('zh-CN')}
                  </td>
                  <td className="py-2 px-3 text-xs">
                    <span>{l.actorName ?? l.actorId}</span>
                    <Badge variant="outline" className="ml-1 text-[9px] h-3.5 px-1 font-normal">
                      {l.actorType}
                    </Badge>
                  </td>
                  <td className="py-2 px-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] h-4 px-1 font-normal',
                        HIGH_RISK.has(l.action) && 'border-[var(--status-absent)]/30 text-[var(--status-absent)]',
                      )}
                    >
                      {l.action}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-xs">{l.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2 border-t border-border">
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</Button>
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</Button>
        </div>
      )}
    </div>
  )
}
