import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '@/lib/db'
import { syncMembers, syncAttendance } from '@/lib/dingtalk-sync'

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
export type { CronJob }

interface JobDef {
  job: CronJob
  settingKey: string      // cron expression setting
  enableKey: string       // enable toggle setting
  defaultCron: string
  run: () => Promise<unknown>
}

/**
 * Validate a 5-field cron expression. node-cron.validate() also accepts the
 * optional-seconds 6-field syntax, but cronMatchesMinute() only implements the
 * 5-field grammar — so we additionally require exactly 5 fields to keep the
 * validator and the matcher in agreement (otherwise a 6-field expr would pass
 * validation but silently never run).
 */
export function isValidCron(expr: string): boolean {
  if (typeof expr !== 'string' || expr.trim().length === 0) return false
  if (expr.trim().split(/\s+/).length !== 5) return false
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
// Month names accepted by node-cron, mapped to 1..12.
const MON_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
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
    run: syncMembers,
  },
  {
    job: 'sync-attendance',
    settingKey: 'cron.attendance',
    enableKey: 'cron.enabled.attendance',
    defaultCron: CRON_DEFAULTS['sync-attendance'],
    run: syncAttendance,
  },
  {
    job: 'publish-news',
    settingKey: 'cron.publish',
    enableKey: 'cron.enabled.publish',
    defaultCron: CRON_DEFAULTS['publish-news'],
    run: publishDueNews,
  },
]

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
  try {
    const result = await def.run()
    await prisma.syncLog.create({
      data: {
        job: def.job,
        source: 'cron',
        status: 'success',
        stats: JSON.stringify(result ?? {}),
      },
    })
  } catch (e) {
    await prisma.syncLog.create({
      data: {
        job: def.job,
        source: 'cron',
        status: 'error',
        message: e instanceof Error ? e.message : 'unknown error',
      },
    })
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

export { executeJob as runJob, cronMatchesMinute } // exported for testing
