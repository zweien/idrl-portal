'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSyncStatus } from '@/lib/api'
import { cn } from '@/lib/utils'
import { RefreshCw, Loader2, CheckCircle2, XCircle, Circle, CircleDot } from 'lucide-react'
import type { SyncKind, SyncStageState, SyncTaskState } from '@/lib/sync-task'

const ENDPOINTS: Record<SyncKind, string> = {
  attendance: '/api/dingtalk/sync-attendance',
  members: '/api/dingtalk/sync-members',
  backfill: '/api/attendance/backfill',
}

function StageIcon({ stage }: { stage: SyncStageState }) {
  const cls = 'h-3 w-3 shrink-0'
  if (stage.status === 'running') return <Loader2 className={cn(cls, 'animate-spin text-primary')} />
  if (stage.status === 'done') return <CheckCircle2 className={cn(cls, 'text-emerald-600')} />
  if (stage.status === 'failed') return <XCircle className={cn(cls, 'text-destructive')} />
  return <Circle className={cn(cls, 'text-muted-foreground/40')} />
}

function formatMs(ms: number | null): string {
  if (ms === null) return ''
  return ms >= 1000 ? ` ${((ms / 1000) as number).toFixed(1)}s` : ` ${ms}ms`
}

/**
 * Sync trigger button + live stage progress for one sync entry point.
 *
 * A click POSTs the sync endpoint, which starts a background task and returns
 * immediately; the component polls GET /api/sync/status (via useSyncStatus,
 * 2s while running) and renders the stage list, the bounded counter (e.g.
 * approval details 34/84), and the final summary with per-stage durations.
 * A 409 ("another sync running") shows the message and the SWR poll picks up
 * the running task's progress. If a started task vanishes from the status
 * endpoint (pm2 restart), shows the honest "interrupted, please retry".
 *
 * `onDone` fires once when the task this component started reaches a terminal
 * state, so pages can revalidate their data.
 */
export function SyncTaskButton({
  kind,
  label,
  runningLabel = '同步中…',
  onDone,
  className,
  url,
  disabled,
}: {
  kind: SyncKind
  label: string
  runningLabel?: string
  onDone?: (task: SyncTaskState) => void
  className?: string
  /** Override the default per-kind endpoint (e.g. backfill with its date). */
  url?: string
  disabled?: boolean
}) {
  const [starting, setStarting] = useState(false)
  const [myTaskId, setMyTaskId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [interrupted, setInterrupted] = useState(false)
  const doneFiredRef = useRef<string | null>(null)
  // Poll OUR task id once started (survives newer tasks from other admins);
  // before that, poll the latest so a same-kind running task is visible.
  const { data: statusResp, mutate: mutateStatus } = useSyncStatus(myTaskId)
  const task = statusResp?.task ?? null

  // "My" task = one this component started, OR a task already running when
  // the component mounted / when our POST got the 409 (myTaskId adopted from
  // the conflict payload) — those callers must see the stages/summary too.
  // The adopt-on-mount form is restricted to the SAME sync kind: on the admin
  // page the member and attendance buttons share one status subscription, and
  // an unrestricted predicate made the attendance button render the member
  // sync's stages (then vanish at completion, terminal tasks not auto-adopted).
  const adoptedRunning = task && task.state === 'running' && !myTaskId && task.kind === kind
  const myTask = task && (task.id === myTaskId || adoptedRunning) ? task : null
  const anyRunning = starting || task?.state === 'running'

  const start = useCallback(async () => {
    if (anyRunning || disabled) return
    setStarting(true)
    setActionError(null)
    setInterrupted(false)
    setMyTaskId(null)
    try {
      const r = await fetch(url ?? ENDPOINTS[kind], { method: 'POST' })
      const data = await r.json().catch(() => ({}) as { error?: string })
      if (r.status === 409 && data.task?.id) {
        // Lost the start race: adopt the running task so this component shows
        // its stages and fires onDone when it lands.
        setMyTaskId(data.task.id as string)
        void mutateStatus()
        return
      }
      if (!r.ok) {
        throw new Error(data.error || `同步启动失败 (${r.status})`)
      }
      if (data.taskId) {
        setMyTaskId(data.taskId as string)
        void mutateStatus()
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }, [anyRunning, disabled, kind, url, mutateStatus])

  // Interrupted detection: our task disappeared from the registry while we
  // were polling it (process restart). One observation is enough — SWR gives
  // undefined on the very first load, so require a prior successful poll.
  const sawMyTaskRef = useRef(false)
  useEffect(() => {
    if (myTaskId && task && task.id === myTaskId) sawMyTaskRef.current = true
    if (myTaskId && sawMyTaskRef.current && statusResp !== undefined && task === null) {
      setInterrupted(true)
    }
  }, [myTaskId, task, statusResp])

  // Fire onDone exactly once when OUR task reaches a terminal state.
  useEffect(() => {
    if (!myTask || myTask.state === 'running') return
    if (doneFiredRef.current === myTask.id) return
    doneFiredRef.current = myTask.id
    onDone?.(myTask)
  }, [myTask, onDone])

  const showMyState = myTask !== null
  const totalMs =
    myTask && myTask.endedAt
      ? new Date(myTask.endedAt).getTime() - new Date(myTask.startedAt).getTime()
      : null

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className={cn('h-8 text-xs gap-1.5', className)}
        onClick={start}
        disabled={anyRunning || disabled}
      >
        {anyRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {anyRunning ? runningLabel : label}
      </Button>

      {(showMyState || interrupted || actionError) && (
        <div className="rounded-md border border-border bg-card px-2.5 py-2 text-xs space-y-1">
          {showMyState && myTask.state === 'running' && (
            <div className="space-y-0.5">
              {myTask.stages.map(s => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <StageIcon stage={s} />
                  <span className={cn(s.status === 'pending' && 'text-muted-foreground/60')}>
                    {s.label}
                  </span>
                  {s.status === 'done' && s.ms !== null && (
                    <span className="text-muted-foreground">{formatMs(s.ms)}</span>
                  )}
                </div>
              ))}
              {myTask.counter && (
                <div className="pl-[18px] text-muted-foreground">
                  {myTask.counter.label} {myTask.counter.done}/{myTask.counter.total}
                </div>
              )}
            </div>
          )}
          {showMyState && myTask.state === 'done' && (
            <div className="flex items-start gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" />
              <span>
                {myTask.result?.summary ?? '同步完成'}
                {totalMs !== null && <span className="text-muted-foreground">（耗时 {(totalMs / 1000).toFixed(1)}s）</span>}
              </span>
            </div>
          )}
          {showMyState && myTask.state === 'failed' && (
            <div className="flex items-start gap-1.5 text-destructive">
              <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>同步失败：{myTask.error ?? '未知错误'}</span>
            </div>
          )}
          {interrupted && (
            <div className="flex items-start gap-1.5 text-amber-600">
              <CircleDot className="h-3 w-3 shrink-0 mt-0.5" />
              <span>同步中断（服务重启），请重试</span>
            </div>
          )}
          {actionError && (
            <div className="flex items-start gap-1.5 text-destructive">
              <XCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
