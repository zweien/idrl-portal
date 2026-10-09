/**
 * In-process sync-task registry: one sync at a time, globally.
 *
 * Why: the DingTalk syncs are long (attendance ~84s cold) and the previous
 * inline-HTTP model meant (a) no progress feedback while the request hung,
 * (b) two concurrent triggers (two admins, or admin + scheduler) double-fanned
 * DingTalk API calls and raced the same DB writes. Here a POST returns a task
 * id immediately; the client polls GET /api/sync/status. A second start while
 * one is running is rejected with the live state attached. The scheduler's
 * cron jobs join the same mutex (see lib/scheduler.ts) so a manual sync
 * blocks the tick and vice versa.
 *
 * The registry is memory-only and holds just the latest task: a pm2 restart
 * mid-sync drops it, and polling clients see the task vanish — the finalize
 * watermark makes the next sync re-pull anything missed, so "interrupted,
 * please retry" is the honest message (no task-state persistence needed).
 */

export type SyncKind = 'attendance' | 'members' | 'backfill'

export interface SyncProgress {
  /** Mark a named stage as running (the previous running stage flips done). */
  stage: (key: string) => void
  /** Report a bounded counter, e.g. approval details fetched 34/84. */
  counter: (label: string, done: number, total: number) => void
}

export interface SyncStageState {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed'
  ms: number | null
}

export interface SyncTaskState {
  id: string
  kind: SyncKind
  state: 'running' | 'done' | 'failed'
  stages: SyncStageState[]
  counter: { label: string; done: number; total: number } | null
  error: string | null
  startedAt: string
  endedAt: string | null
  /** Human summary + machine stats, set on completion by the task fn. */
  result: { summary: string; stats?: Record<string, unknown> } | null
}

/** Stage definitions per sync kind — the labels the UI renders. */
export const SYNC_STAGES: Record<SyncKind, Array<{ key: string; label: string }>> = {
  attendance: [
    { key: 'attendance', label: '拉取考勤打卡' },
    { key: 'leave', label: '拉取请假' },
    { key: 'trip', label: '拉取出差审批' },
    { key: 'write', label: '写入数据库' },
  ],
  members: [
    { key: 'fetch', label: '拉取部门与成员' },
    { key: 'write', label: '写入数据库' },
  ],
  backfill: [
    { key: 'fetch', label: '拉取单日数据' },
    { key: 'write', label: '写入数据库' },
  ],
}

// The mutex: true from the moment a run starts until it finishes. Deliberately
// separate from the task registry — inline (machine) runs hold the mutex but
// never register a task for polling (their callers block on the response).
let mutexHeld = false
// Background tasks by id, newest last. Keeping finished tasks (bounded) lets
// a polling client keep reading ITS task even after another admin starts a
// newer one — the alternative (latest-only) permanently orphans the previous
// starter's completion summary and onDone revalidation.
const tasks = new Map<string, SyncTaskState>()
const MAX_RETAINED = 10
let seq = 0

/** Latest task (registry order), or a specific one by id. */
export function getSyncTask(id?: string): SyncTaskState | null {
  if (id) return tasks.get(id) ?? null
  let latest: SyncTaskState | null = null
  for (const t of tasks.values()) latest = t
  return latest
}

/** True while any sync task (manual or scheduler-joined) is mid-run. */
export function isSyncBusy(): boolean {
  return mutexHeld
}

export type SyncTaskFn = (progress: SyncProgress) => Promise<{ summary: string; stats?: Record<string, unknown> }>
export type SyncTaskResult =
  | { ok: true; task: SyncTaskState; result: { summary: string; stats?: Record<string, unknown> } }
  | { ok: false; reason: 'already-running' | 'failed'; task: SyncTaskState }

/**
 * Run a sync under the global mutex. `background` = fire-and-forget for
 * cookie-session callers (the route returns the task state immediately);
 * `background: false` = inline for machine/API-key callers, which keeps the
 * documented blocking stats response (no task registration — machines don't
 * poll). Both paths share the mutex, so neither can overlap the other.
 */
export async function runSyncTask(
  kind: SyncKind,
  fn: SyncTaskFn,
  opts: { background: boolean },
): Promise<SyncTaskResult> {
  if (mutexHeld) {
    const latest = getSyncTask()
    return {
      ok: false,
      reason: 'already-running',
      task: latest ?? { id: 'unknown', kind, state: 'running', stages: [], counter: null, error: null, startedAt: new Date().toISOString(), endedAt: null, result: null },
    }
  }
  const task: SyncTaskState = {
    id: `sync-${Date.now()}-${++seq}`,
    kind,
    state: 'running',
    stages: SYNC_STAGES[kind].map(s => ({ ...s, status: 'pending', ms: null })),
    counter: null,
    error: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    result: null,
  }
  mutexHeld = true
  if (opts.background) {
    tasks.set(task.id, task)
    while (tasks.size > MAX_RETAINED) {
      const oldest = tasks.keys().next().value
      if (oldest === undefined) break
      tasks.delete(oldest)
    }
  }

  // Per-stage wall time via explicit stage-start stamps (recorded in SyncLog
  // stats by the task fn for cost analysis).
  const stageStarts = new Map<string, number>()
  const progress: SyncProgress = {
    stage(key) {
      const now = Date.now()
      const running = task.stages.find(s => s.status === 'running')
      if (running && stageStarts.has(running.key)) {
        running.status = 'done'
        running.ms = now - (stageStarts.get(running.key) as number)
      }
      const next = task.stages.find(s => s.key === key)
      if (next) {
        next.status = 'running'
        stageStarts.set(key, now)
      }
    },
    counter(label, done, total) {
      task.counter = { label, done, total }
    },
  }

  const finish = (state: 'done' | 'failed', error?: string) => {
    const now = Date.now()
    const running = task.stages.find(s => s.status === 'running')
    if (running && stageStarts.has(running.key)) {
      running.status = state === 'done' ? 'done' : 'failed'
      running.ms = now - (stageStarts.get(running.key) as number)
    }
    task.state = state
    task.error = error ?? null
    task.endedAt = new Date().toISOString()
  }

  if (!opts.background) {
    // Inline (machine) path: run under the mutex without registering a
    // polling task — the caller blocks on the full response.
    try {
      const result = await fn(progress)
      finish('done')
      mutexHeld = false
      return { ok: true, task, result }
    } catch (e) {
      finish('failed', e instanceof Error ? e.message : String(e))
      mutexHeld = false
      return { ok: false, reason: 'failed', task }
    }
  }

  // Background path: detached — the route returns the task state now.
  void (async () => {
    try {
      const result = await fn(progress)
      finish('done')
      task.result = result
    } catch (e) {
      finish('failed', e instanceof Error ? e.message : String(e))
    } finally {
      mutexHeld = false
    }
  })()
  return { ok: true, task, result: { summary: '' } }
}
