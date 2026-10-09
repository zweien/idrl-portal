import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '@/lib/db'
import { syncMembers, syncAttendance, flattenAttendanceStats } from '@/lib/dingtalk-sync'
import { createBackup, pruneBackups, readKeepCount } from '@/lib/backup'
import { pruneAuditLogs, readKeepDays } from '@/lib/audit'

/**
 * Background scheduler. Registered once at server boot via
 * instrumentation.ts. Runs three jobs (members sync, attendance sync,
 * publish-due-news) on cron expressions stored in the Setting table, so
 * admins can change cadence without a redeploy.
 *
 * Implementation note: each job ticks every minute on a fixed heartbeat and,
 * on each tick, re-reads its live cron expression from the Setting table and
 * checks whether the current minute matches. This makes setting changes take
 * effect within ≤60s (a full task destroy/recreate isn't needed), at the cost
 * of one cheap minute-boundary check per job.
 *
 * Settings keys:
 *   cron.members        — cron expression for sync-members
 *   cron.attendance     — cron expression for sync-attendance
 *   cron.publish        — cron expression for the due-news publisher
 *   cron.enabled.*      — "true"/"false" toggle per job
 */

// Cron presets + per-job defaults live in the client-safe lib/cron-presets.ts
// (no server-only deps) so the admin scheduling panel ('use client') can import
// them without dragging Prisma/node-cron into the browser bundle. Re-exported
// here for server-side callers that already import from this module.
export { CRON_PRESETS, CRON_DEFAULTS } from '@/lib/cron-presets'
import { CRON_DEFAULTS } from '@/lib/cron-presets'
import type { CronJob } from '@/lib/cron-presets'
import { isSyncBusy, type SyncKind } from '@/lib/sync-task'
export type { CronJob }

interface JobDef {
  /** When set, the tick is skipped silently while a sync task (manual or
   * scheduler) is running — joins the global sync mutex in lib/sync-task. */
  busyKey?: import('@/lib/sync-task').SyncKind
  job: CronJob
  settingKey: string      // cron expression setting
  enableKey: string       // enable toggle setting
  defaultCron: string
  run: () => Promise<unknown>
  /** Optional transform of the result before persisting it as SyncLog.stats. */
  flattenStats?: (result: unknown) => Record<string, unknown>
  /**
   * Boot catch-up window in ms. On process start, if the last recorded run of
   * this job (by SyncLog timestamp) is older than this, the job fires once
   * immediately (source: 'catchup'). Undefined = no boot catch-up. Reserved
   * for jobs whose missed fire has visible consequences AND that are idempotent
   * (publish-news: a due draft stays draft; backup: a day has no snapshot).
   * Sync jobs are skipped here — syncAttendance has its own lastFinalizedDate
   * watermark that self-heals on the next regular fire.
   */
  catchupMs?: number
}
/**
 * Validate a 5-field cron expression the scheduler can actually execute.
 *
 * node-cron's validate() accepts v4-documented tokens (L, ?, W, #) and
 * inverted ranges that cronMatchesMinute() cannot interpret: bare L/? expand
 * to parseInt→NaN→an empty set, an inverted range like 5-3 loops zero times
 * (the job silently never fires — the non-match return precedes any logging),
 * and prefixed tokens like 15W get parseInt-truncated and fire on the wrong
 * day. Reject exactly those tokens up front so both the settings route and the
 * per-tick gate fail visibly instead of saving a dead expression.
 */
export function isValidCron(expr: string): boolean {
  if (typeof expr !== 'string' || expr.trim().length === 0) return false
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  for (const field of parts) {
    for (const tok of field.split(',')) {
      // Mirror the matcher's own token shape (number | * | weekday/month
      // name, optional range/step) so anything it can't parse dies here —
      // this alone rejects the v4-only tokens (bare L/? are single letters,
      // 15W/5L are digits+letter, 6#3 contains #) WITHOUT false-rejecting
      // legitimate names that merely contain those letters (wed/jul).
      const m = /^(\*|\d+|[a-z]{3,9})(?:-(\*|\d+|[a-z]{3,9}))?(?:\/(\d+))?$/i.exec(tok)
      if (!m) return false
      // Inverted ranges expand to an empty set in the matcher (job death);
      // names must be compared through the same maps the matcher uses.
      if (m[1] && m[2] && m[1] !== '*' && m[2] !== '*') {
        const a = DOW_NAMES[m[1].toLowerCase()] ?? MON_NAMES[m[1].toLowerCase()] ?? parseInt(m[1], 10)
        const b = DOW_NAMES[m[2].toLowerCase()] ?? MON_NAMES[m[2].toLowerCase()] ?? parseInt(m[2], 10)
        if (!Number.isNaN(a) && !Number.isNaN(b) && a > b) return false
      }
    }
  }
  return cron.validate(expr)
}

/**
 * Does the given cron expression match a specific minute? We compare against
 * the UTC fields of `date` — callers store cron in UTC terms. We expand each
 * of the 5 cron fields (minute, hour, day-of-month, month, day-of-week) into a
 * set, supporting star, ranges, comma lists, and step values, then test
 * whether every field of `date` is in its set.
 */
// Day-of-week names accepted by node-cron (case-insensitive, 3-letter or full),
// mapped to 0=Sunday..6=Saturday to match Date.getUTCDay().
const DOW_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
}
// Month names accepted by node-cron, mapped to 1..12. Full names included so
// isValidCron and cronMatchesMinute agree (a name the validator accepts but
// the matcher can't map expands to NaN — silent job death).
const MON_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

/**
 * Timezone the cron expressions are interpreted in. The portal serves a
 * Beijing lab, so admins think in 北京时间; "每天 8:30" should fire at 08:30
 * Beijing, not 08:30 UTC. Kept as a constant (not an env var) because the
 * deployment is single-site.
 */
const SCHED_TZ = 'Asia/Shanghai'

/** Extract calendar fields of `date` as seen in SCHED_TZ (not process-local). */
function tzFields(date: Date): { min: number; hour: number; dom: number; mon: number; dow: number } {
  // Intl parts are stable across runtimes; format in the target zone then read.
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHED_TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  })
  const parts = f.formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  // weekday "Sun".."Sat" → 0..6
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')] ?? 0
  return {
    min: parseInt(get('minute'), 10),
    // Intl can emit "24" at midnight with hour12:false on some runtimes; normalize.
    hour: parseInt(get('hour'), 10) % 24,
    dom: parseInt(get('day'), 10),
    mon: parseInt(get('month'), 10),
    dow: wd,
  }
}

function cronMatchesMinute(expr: string, date: Date): boolean {
  // We expand each cron field into a set and test membership. node-cron accepts
  // a richer grammar than pure integers (weekday/month names, dow 7=Sunday),
  // so we normalize those. Fields are read in SCHED_TZ (Beijing), not UTC.
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [minF, hourF, domF, monF, dowF] = parts
  const expand = (
    field: string,
    min: number,
    max: number,
    nameMap?: Record<string, number>,
  ): Set<number> => {
    const out = new Set<number>()
    const normalize = (tok: string): number => {
      const lower = tok.toLowerCase()
      if (nameMap && nameMap[lower] !== undefined) return nameMap[lower]
      const n = parseInt(tok, 10)
      return n
    }
    for (const token of field.split(',')) {
      let step = 1
      let base = token
      const slashIdx = token.indexOf('/')
      if (slashIdx >= 0) {
        step = parseInt(token.slice(slashIdx + 1), 10)
        base = token.slice(0, slashIdx)
      }
      if (base === '*') {
        for (let v = min; v <= max; v += step) out.add(v)
      } else if (base.includes('-')) {
        const [loTok, hiTok] = base.split('-')
        const lo = normalize(loTok)
        const hi = normalize(hiTok)
        if (isNaN(lo) || isNaN(hi) || isNaN(step)) return out // unparseable → matches nothing
        for (let v = lo; v <= hi; v += step) out.add(v)
      } else {
        const v = normalize(base)
        if (isNaN(v) || isNaN(step)) return out // unparseable → matches nothing
        out.add(v)
      }
    }
    return out
  }
  // dow 7 is an alias for Sunday (0) in standard cron.
  const dows = expand(dowF, 0, 7, DOW_NAMES)
  if (dows.has(7)) { dows.delete(7); dows.add(0) }
  const f = tzFields(date)
  return (
    expand(minF, 0, 59).has(f.min) &&
    expand(hourF, 0, 23).has(f.hour) &&
    expand(domF, 1, 31).has(f.dom) &&
    expand(monF, 1, 12, MON_NAMES).has(f.mon) &&
    dows.has(f.dow)
  )
}

async function readSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return row?.value ?? null
}

async function isEnabled(enableKey: string): Promise<boolean> {
  const v = await readSetting(enableKey)
  // default enabled unless explicitly "false"
  return v !== 'false'
}

/** Publish any draft news whose publishAt time has passed. */
export async function publishDueNews(): Promise<{ published: number }> {
  const now = new Date().toISOString()
  const due = await prisma.newsItem.findMany({
    where: { status: 'draft', publishAt: { not: null, lte: now } },
    select: { id: true },
  })
  let published = 0
  for (const n of due) {
    await prisma.newsItem.update({ where: { id: n.id }, data: { status: 'published' } })
    published++
  }
  return { published }
}

const JOB_DEFS: JobDef[] = [
  {
    job: 'sync-members',
    settingKey: 'cron.members',
    enableKey: 'cron.enabled.members',
    defaultCron: CRON_DEFAULTS['sync-members'],
    busyKey: 'members' as SyncKind,
    run: syncMembers,
  },
  {
    job: 'sync-attendance',
    settingKey: 'cron.attendance',
    enableKey: 'cron.enabled.attendance',
    defaultCron: CRON_DEFAULTS['sync-attendance'],
    busyKey: 'attendance' as SyncKind,
    run: syncAttendance,
    // Persist flattened stats ({total, present, leave, trip, absent, finalizedDays})
    // instead of leaking the nested {stats:{...}} shape into the log row.
    flattenStats: (result) => flattenAttendanceStats(result as Awaited<ReturnType<typeof syncAttendance>>),
  },
  {
    job: 'publish-news',
    settingKey: 'cron.publish',
    enableKey: 'cron.enabled.publish',
    defaultCron: CRON_DEFAULTS['publish-news'],
    run: publishDueNews,
    // A due draft should flip to published within minutes; if we were down
    // long enough to miss more than two default cycles, catch up on boot.
    catchupMs: 10 * 60 * 1000,
  },
  {
    job: 'backup',
    settingKey: 'cron.backup',
    enableKey: 'cron.enabled.backup',
    defaultCron: CRON_DEFAULTS['backup'],
    // Default is daily; if the last snapshot is older than ~a day, take one now
    // rather than waiting for the next cron boundary (which could be 24h away).
    catchupMs: 25 * 60 * 60 * 1000,
    run: async () => {
      // Take a snapshot, then prune to the configured retention so backups
      // don't accumulate unbounded.
      const info = await createBackup('auto')
      const keep = await readKeepCount()
      const pruned = pruneBackups(keep)
      // Also prune old audit + sync logs on the same cadence. SyncLog grows
      // fastest (one row per job tick that fires) and had no retention before,
      // so default it shorter than audit logs.
      const keepDays = await readKeepDays()
      const prunedLogs = await pruneAuditLogs(keepDays)
      const prunedSync = await pruneSyncLogs(await readSyncKeepDays())
      return {
        file: info.filename,
        kept: keep,
        pruned: pruned.deleted.length,
        prunedLogs: prunedLogs.deleted,
        prunedSyncLogs: prunedSync.deleted,
      }
    },
  },
]

/**
 * Jobs currently mid-execution. node-cron's minute heartbeat fires unconditionally,
 * so without a guard a slow run (e.g. syncAttendance writing one row per person
 * per day) would overlap with the next tick and two runs would race on SQLite's
 * single writer. We skip a tick when the previous run for the same job hasn't
 * returned yet — the next matching minute will pick it up.
 */
const running = new Set<CronJob>()

/**
 * Run a job's body and persist a SyncLog row (success or error). Source labels
 * who triggered the run: 'cron' (heartbeat match), 'catchup' (boot recovery),
 * 'api'/'manual' (HTTP). Factored out so both the cron heartbeat and the boot
 * catch-up share identical logging/error handling.
 */
async function runAndLog(def: JobDef, source: 'cron' | 'catchup') {
  try {
    const result = await def.run()
    await prisma.syncLog.create({
      data: {
        job: def.job,
        source,
        status: 'success',
        stats: JSON.stringify(def.flattenStats ? def.flattenStats(result) : (result ?? {})),
      },
    })
  } catch (e) {
    await prisma.syncLog.create({
      data: {
        job: def.job,
        source,
        status: 'error',
        message: e instanceof Error ? e.message : 'unknown error',
      },
    })
  }
}

/**
 * Delete SyncLog rows older than `keepDays`. SyncLog records every job tick
 * (members/attendance/publish/backup success+error), so it grows fastest and
 * had no retention before this — a dev DB had thousands of rows after weeks.
 */
async function pruneSyncLogs(keepDays: number): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000)
  const result = await prisma.syncLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return { deleted: result.count }
}

/** SyncLog retention (Setting `synclog.keepDays`, default 30). */
async function readSyncKeepDays(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: 'synclog.keepDays' } })
  const n = row ? parseInt(row.value, 10) : 30
  return Number.isInteger(n) && n > 0 ? n : 30
}

async function executeJob(def: JobDef) {
  // Re-read config on every tick so admin changes take effect without a restart.
  if (!(await isEnabled(def.enableKey))) return
  // An empty string (saved via the panel's empty custom input) must NOT
  // override the default and silently stop the job — treat it as absent.
  const raw = await readSetting(def.settingKey)
  const expr = raw && raw.trim() !== '' ? raw : def.defaultCron
  if (!isValidCron(expr)) return
  // Only run when the current minute matches the live expression.
  if (!cronMatchesMinute(expr, new Date())) return
  // Skip if the previous run hasn't finished — see `running` doc.
  if (running.has(def.job)) return
  // Join the global sync mutex: a manual sync in progress defers this tick
  // silently (the heartbeat repeats next minute; the watermark self-heals).
  if (def.busyKey && isSyncBusy()) return
  running.add(def.job)
  try {
    await runAndLog(def, 'cron')
  } finally {
    running.delete(def.job)
  }
}

/**
 * On process start, fire any job whose last recorded run is stale enough that
 * missing it has visible consequences (publish-news: due drafts; backup: no
 * daily snapshot). Sync jobs are excluded — syncAttendance self-heals via its
 * lastFinalizedDate watermark, and a redundant syncMembers is harmless but not
 * worth the DingTalk API load on every boot.
 *
 * Reads the most recent SyncLog row per job (any status) to decide staleness,
 * so a crashed run still counts as "we tried recently".
 */
async function runCatchupOnBoot() {
  for (const def of JOB_DEFS) {
    if (!def.catchupMs) continue
    if (!(await isEnabled(def.enableKey))) continue
    const last = await prisma.syncLog.findFirst({
      where: { job: def.job },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { createdAt: true },
    })
    const stale = !last || Date.now() - last.createdAt.getTime() > def.catchupMs
    if (!stale) continue
    // Respect the mutex (a catch-up could race a cron tick landing at boot).
    if (running.has(def.job)) continue
    running.add(def.job)
    try {
      await runAndLog(def, 'catchup')
    } finally {
      running.delete(def.job)
    }
  }
}

// Each job ticks every minute on a fixed heartbeat; the live cron expression
// decides whether the tick actually fires the work.
const tasks = new Map<CronJob, ScheduledTask>()

let registered = false

/** Register all cron jobs (minute heartbeat). Safe to call once (idempotent). */
export function registerScheduler() {
  if (registered) return
  registered = true
  // Fire-and-forget boot catch-up: don't block process start on it.
  void runCatchupOnBoot()
  for (const def of JOB_DEFS) {
    const task = cron.schedule('* * * * *', () => {
      void executeJob(def)
    })
    tasks.set(def.job, task)
  }
}

/** Stop and clear all tasks (used by tests). */
export function unregisterScheduler() {
  for (const task of tasks.values()) task.stop()
  tasks.clear()
  registered = false
}

export { executeJob as runJob, runCatchupOnBoot, pruneSyncLogs, readSyncKeepDays, cronMatchesMinute } // exported for testing
