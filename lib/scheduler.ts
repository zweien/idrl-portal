import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '@/lib/db'
import { syncMembers, syncAttendance } from '@/lib/dingtalk-sync'

/**
 * Background scheduler. Registered once at server boot via
 * instrumentation.ts. Runs three jobs (members sync, attendance sync,
 * publish-due-news) on cron expressions stored in the Setting table, so
 * admins can change cadence without a redeploy.
 *
 * Settings keys:
 *   cron.members        — cron expression for sync-members
 *   cron.attendance     — cron expression for sync-attendance
 *   cron.publish        — cron expression for the due-news publisher
 *   cron.enabled.*      — "true"/"false" toggle per job
 */

export type CronJob = 'sync-members' | 'sync-attendance' | 'publish-news'

interface JobDef {
  job: CronJob
  settingKey: string      // cron expression setting
  enableKey: string       // enable toggle setting
  defaultCron: string
  run: () => Promise<unknown>
}

// Preset cadences surfaced in the admin UI → cron expressions.
export const CRON_PRESETS: Record<string, { label: string; expr: string }> = {
  // attendance
  every15min:  { label: '每 15 分钟', expr: '*/15 * * * *' },
  every30min:  { label: '每 30 分钟', expr: '*/30 * * * *' },
  hourly:      { label: '每小时', expr: '0 * * * *' },
  workdayHours: { label: '工作日 8-20 点每小时', expr: '0 8-20 * * 1-5' },
  // members / publish (lower frequency)
  daily6am:    { label: '每天 6:00', expr: '0 6 * * *' },
  dailyMidnight: { label: '每天凌晨', expr: '0 0 * * *' },
  weeklyMon:   { label: '每周一', expr: '0 6 * * 1' },
  every5min:   { label: '每 5 分钟', expr: '*/5 * * * *' },
}

const DEFAULTS: Record<CronJob, string> = {
  'sync-members': CRON_PRESETS.daily6am.expr,
  'sync-attendance': CRON_PRESETS.hourly.expr,
  'publish-news': CRON_PRESETS.every5min.expr,
}

/** Validate a cron expression (5-field). Returns true if node-cron accepts it. */
export function isValidCron(expr: string): boolean {
  return typeof expr === 'string' && expr.trim().length > 0 && cron.validate(expr)
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
async function publishDueNews(): Promise<{ published: number }> {
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
    defaultCron: DEFAULTS['sync-members'],
    run: syncMembers,
  },
  {
    job: 'sync-attendance',
    settingKey: 'cron.attendance',
    enableKey: 'cron.enabled.attendance',
    defaultCron: DEFAULTS['sync-attendance'],
    run: syncAttendance,
  },
  {
    job: 'publish-news',
    settingKey: 'cron.publish',
    enableKey: 'cron.enabled.publish',
    defaultCron: DEFAULTS['publish-news'],
    run: publishDueNews,
  },
]

async function executeJob(def: JobDef) {
  // Re-read config on every tick so admin changes take effect without a restart.
  if (!(await isEnabled(def.enableKey))) return
  const expr = (await readSetting(def.settingKey)) ?? def.defaultCron
  if (!isValidCron(expr)) return
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

// One cron task per job. Re-scheduled on the default cadence; each tick
// re-reads the live expression from the Setting table.
const tasks = new Map<CronJob, ScheduledTask>()

let registered = false

/** Register all cron jobs. Safe to call once (idempotent guard). */
export function registerScheduler() {
  if (registered) return
  registered = true
  for (const def of JOB_DEFS) {
    // Schedule on the default cadence; the actual work re-reads settings.
    const task = cron.schedule(def.defaultCron, () => {
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

export { executeJob as runJob } // exported for testing
