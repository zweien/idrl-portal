'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { UserMinus, ArrowLeftRight, ChevronDown, ChevronUp, Loader2, Check } from 'lucide-react'
import type { DepartedMember } from '@/lib/dingtalk-sync'

/**
 * Departure-detection notice for the personnel board. Populated from a
 * finished member-sync task's stats: people whose unionid left the DingTalk
 * org entirely (offboarded) vs. transferred out of the synced subtree. Each
 * row offers the deliberate 停用 action (status→absent, free the workstation,
 * disable login; history kept). Disappears when all rows are handled or the
 * page reloads after the next member sync.
 */
export function OffboardNotice({
  offboarded,
  transferred,
  onHandled,
}: {
  offboarded: DepartedMember[]
  transferred: DepartedMember[]
  onHandled: (handled: DepartedMember) => void
}) {
  const [open, setOpen] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  if (offboarded.length === 0 && transferred.length === 0) return null

  async function offboard(m: DepartedMember) {
    if (busyId) return
    setBusyId(m.id)
    setError(null)
    try {
      const r = await fetch(`/api/personnel/${m.id}/offboard`, { method: 'POST' })
      const data = await r.json().catch(() => ({}) as { error?: string })
      if (!r.ok) throw new Error(data.error || `停用失败 (${r.status})`)
      setDoneIds(prev => new Set(prev).add(m.id))
      onHandled(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const Row = ({ m, icon }: { m: DepartedMember; icon: React.ReactNode }) => {
    const done = doneIds.has(m.id)
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className={cn('text-xs', done && 'line-through text-muted-foreground')}>{m.name}</span>
        {done ? (
          <span className="text-xs text-emerald-600 flex items-center gap-0.5"><Check className="h-3 w-3" />已停用</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px] px-2 gap-1"
            onClick={() => offboard(m)}
            disabled={busyId !== null}
          >
            {busyId === m.id && <Loader2 className="h-3 w-3 animate-spin" />}
            停用
          </Button>
        )}
      </div>
    )
  }

  const total = offboarded.length + transferred.length

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
      <button className="w-full flex items-center gap-2 text-left" onClick={() => setOpen(o => !o)}>
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
          成员同步检测到 {total} 人不在同步范围
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-1.5 pl-1 space-y-0.5">
          {offboarded.map(m => <Row key={m.id} m={m} icon={<UserMinus className="h-3.5 w-3.5" />} />)}
          {transferred.map(m => <Row key={m.id} m={m} icon={<ArrowLeftRight className="h-3.5 w-3.5" />} />)}
          <p className="text-[11px] text-muted-foreground pt-1">
            停用 = 状态置未到、释放工位、禁用其门户登录；考勤历史保留，可恢复。
          </p>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}
    </div>
  )
}
