/**
 * Attendance domain helpers — date math in Asia/Shanghai and work-hour calc.
 *
 * Kept separate from lib/dingtalk-admin.ts (which is DingTalk API I/O) and
 * lib/dingtalk-sync.ts (which orchestrates syncs) so the pure logic is testable
 * without mocking network calls or Prisma.
 */

export const SHANGHAI_TZ = 'Asia/Shanghai'

/** "yyyy-MM-dd" for a ms epoch, in Asia/Shanghai. */
export function dateStr(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: SHANGHAI_TZ })
}

/** Today's "yyyy-MM-dd" in Asia/Shanghai. */
export function todayDateStr(): string {
  return dateStr(Date.now())
}

/** Shift a "yyyy-MM-dd" by deltaDays (negative ok), Shanghai tz. */
export function shiftDate(input: string, deltaDays: number): string {
  const t = new Date(input + 'T00:00:00+08:00').getTime() + deltaDays * 24 * 60 * 60 * 1000
  return dateStr(t)
}

/** First day of the month containing `dateStr`, as "yyyy-MM-dd". */
export function monthStart(dateStr: string): string {
  return dateStr.slice(0, 8) + '01'
}

/** Inclusive list of "yyyy-MM-dd" days from `fromStr` to `toStr` (Shanghai dates). */
export function dateRangeDays(fromStr: string, toStr: string): string[] {
  const out: string[] = []
  const start = new Date(fromStr + 'T00:00:00+08:00').getTime()
  const end = new Date(toStr + 'T00:00:00+08:00').getTime()
  if (end < start) return out
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    out.push(dateStr(t))
  }
  return out
}

/** Start/end ms (UTC) of a given "yyyy-MM-dd" day in Asia/Shanghai. */
export function dayBounds(dateStr: string): { startMs: number; endMs: number } {
  return {
    startMs: new Date(dateStr + 'T00:00:00+08:00').getTime(),
    endMs: new Date(dateStr + 'T23:59:59+08:00').getTime(),
  }
}

/** Parse "HH:mm" into minutes-since-midnight. Returns null on bad input. */
export function parseHM(hm?: string | null): number | null {
  if (!hm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** Format minutes-since-midnight as "H:mm" or "HH:mm". */
export function formatHM(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * Work minutes for one day = checkOut − checkIn (no lunch deduction).
 * Returns null when either punch is missing, or when checkOut <= checkIn
 * (overnight/anomaly — caller should keep the raw punches for manual review
 * but exclude the day from hour totals).
 */
export function computeWorkMinutes(checkIn?: string | null, checkOut?: string | null): number | null {
  const a = parseHM(checkIn)
  const b = parseHM(checkOut)
  if (a === null || b === null) return null
  const diff = b - a
  if (diff <= 0) return null
  return diff
}

/** Format a nullable minute count as "Hh Mm" (e.g. 8h 32m), or "—" if null. */
export function formatWorkHours(min: number | null): string {
  if (min === null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

// ── Export domain (work-hour rules + CSV generation) ─────────────────────

/**
 * The status-driven work-hour rule for exports.
 *
 * Unlike computeWorkMinutes() (raw checkOut − checkIn, used for display),
 * this applies the business rules agreed for reporting:
 *  - present:   full punches → span; missing punch → 0 AND counted as 缺卡
 *  - trip:      always the configured fixed hours (actual punches ignored for
 *               the total, but still shown in the detail rows)
 *  - leave:     full punches → span (half-day leave where the person still
 *               worked); no punches → 0
 *  - absent:    0
 *
 * Returns hours as a NUMBER (0 when not countable) plus a `missingPunch`
 * flag so the summary can count 缺卡天数 independently of the hours.
 */
export function exportWorkHours(
  status: string,
  checkIn?: string | null,
  checkOut?: string | null,
  tripHours = 8,
): { hours: number; missingPunch: boolean } {
  const hasFull = computeWorkMinutes(checkIn, checkOut) !== null
  switch (status) {
    case 'present':
      if (hasFull) return { hours: computeWorkMinutes(checkIn, checkOut)! / 60, missingPunch: false }
      return { hours: 0, missingPunch: true }
    case 'trip':
      return { hours: tripHours, missingPunch: false }
    case 'leave':
      if (hasFull) return { hours: computeWorkMinutes(checkIn, checkOut)! / 60, missingPunch: false }
      return { hours: 0, missingPunch: false }
    default:
      return { hours: 0, missingPunch: false }
  }
}

/** Chinese status labels for CSV output. */
const STATUS_LABEL: Record<string, string> = {
  present: '在位',
  trip: '出差',
  leave: '请假',
  absent: '未到',
}

export interface ExportRow {
  name: string
  date: string
  checkIn?: string | null
  checkOut?: string | null
  status: string
}

/** Escape a CSV field (wrap in quotes when it contains , " or newline). */
function csvField(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/**
 * Build the per-day detail CSV. One row per (person, day). Hours use the
 * export rules (trip → fixed, leave → punches if present). Missing-punch
 * present days are labeled 在位(缺卡).
 */
export function buildDetailCsv(rows: ExportRow[], tripHours = 8): string {
  const lines: string[] = ['姓名,日期,上班,下班,工时(小时),状态']
  for (const r of rows) {
    const { hours, missingPunch } = exportWorkHours(r.status, r.checkIn, r.checkOut, tripHours)
    let statusLabel = STATUS_LABEL[r.status] ?? r.status
    if (r.status === 'present' && missingPunch) statusLabel = '在位(缺卡)'
    lines.push([
      csvField(r.name),
      r.date,
      r.checkIn ?? '—',
      r.checkOut ?? '—',
      hours.toFixed(2),
      statusLabel,
    ].join(','))
  }
  // UTF-8 BOM so Excel/WPS on Windows open it as Chinese, not mojibake.
  return '﻿' + lines.join('\n')
}

export interface SummaryRow {
  name: string
  presentDays: number
  tripDays: number
  leaveDays: number
  missingPunchDays: number
  totalHours: number
  /** Denominator for the average: days that actually counted toward hours
   * (present-with-punches + trip + leave-with-punches). */
  countedDays: number
}

/**
 * Build the monthly/period summary CSV. One row per person. Average hours =
 * total ÷ counted days (not ÷ present days) so trip fixed hours don't
 * inflate the daily intensity figure.
 */
export function buildSummaryCsv(rows: SummaryRow[], from: string, to: string): string {
  const lines: string[] = ['姓名,日期范围,出勤天数,出差天数,请假天数,缺卡天数,总工时(小时),平均工时(小时)']
  const range = `${from}~${to}`
  for (const r of rows) {
    const avg = r.countedDays > 0 ? r.totalHours / r.countedDays : 0
    lines.push([
      csvField(r.name),
      range,
      String(r.presentDays),
      String(r.tripDays),
      String(r.leaveDays),
      String(r.missingPunchDays),
      r.totalHours.toFixed(2),
      avg.toFixed(2),
    ].join(','))
  }
  return '﻿' + lines.join('\n')
}
