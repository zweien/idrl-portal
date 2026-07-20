/**
 * Cron presets + per-job default expressions. Lives in a client-safe module
 * (no server-only imports like lib/db or node-cron) so it can be imported by
 * both the admin scheduling panel ('use client') and the server scheduler.
 *
 * Keep in sync with lib/scheduler.ts usage.
 */

export type CronJob = 'sync-members' | 'sync-attendance' | 'publish-news' | 'backup'

// Preset cadences surfaced in the admin UI → cron expressions.
export const CRON_PRESETS: Record<string, { label: string; expr: string }> = {
  every15min:  { label: '每 15 分钟', expr: '*/15 * * * *' },
  every30min:  { label: '每 30 分钟', expr: '*/30 * * * *' },
  hourly:      { label: '每小时', expr: '0 * * * *' },
  workdayHours: { label: '工作日 8-20 点每小时', expr: '0 8-20 * * 1-5' },
  daily830:    { label: '每天 8:30', expr: '30 8 * * *' },
  daily6am:    { label: '每天 6:00', expr: '0 6 * * *' },
  dailyMidnight: { label: '每天凌晨', expr: '0 0 * * *' },
  weeklyMon:   { label: '每周一', expr: '0 6 * * 1' },
  every5min:   { label: '每 5 分钟', expr: '*/5 * * * *' },
}

/** Default cron expressions per job, used when no Setting row exists. */
export const CRON_DEFAULTS: Record<CronJob, string> = {
  'sync-members': CRON_PRESETS.daily6am.expr,
  'sync-attendance': CRON_PRESETS.hourly.expr,
  'publish-news': CRON_PRESETS.every5min.expr,
  'backup': CRON_PRESETS.dailyMidnight.expr,
}
