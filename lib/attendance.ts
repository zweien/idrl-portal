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
