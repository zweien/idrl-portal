import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildSummaryCsv, exportWorkHours, type SummaryRow } from '@/lib/attendance'
import { todayDateStr } from '@/lib/attendance'
import { resolveExportScope, csvAttachmentHeaders, readTripWorkHours } from '../_shared'

/**
 * GET /api/attendance/export/summary?from=&to=&personId=
 *
 * Per-person period summary as a downloadable CSV (UTF-8 with BOM). One row
 * per person over the whole [from, to] range (no per-month split — pick the
 * range you want). Columns: present/trip/leave/missing-punch day counts,
 * total hours, and average hours = total ÷ counted days (days that actually
 * counted toward hours: present-with-punches + trip + leave-with-punches).
 *
 * Non-admins can only export their own personId (forced). Admins may omit
 * personId for all persons, or pass one to scope to a single person.
 */
export async function GET(request: Request) {
  const scope = await resolveExportScope(request)
  if (!scope.ok) return scope.response

  const tripHours = await readTripWorkHours()

  const rows = await prisma.attendanceRecord.findMany({
    where: {
      date: { gte: scope.from, lte: scope.to },
      ...(scope.personId ? { personId: scope.personId } : {}),
    },
    include: { person: { select: { name: true } } },
  })

  const today = todayDateStr()
  const byPerson = new Map<string, SummaryRow>()
  for (const r of rows) {
    let entry = byPerson.get(r.personId)
    if (!entry) {
      entry = {
        name: r.person.name,
        presentDays: 0,
        tripDays: 0,
        leaveDays: 0,
        missingPunchDays: 0,
        totalHours: 0,
        countedDays: 0,
      }
      byPerson.set(r.personId, entry)
    }
    // Today's still-open record isn't 缺卡 yet (the person may not have
    // checked out). Only settled historical days count a missing punch.
    const isFinalized = r.date < today
    const { hours, missingPunch } = exportWorkHours(r.status, r.checkIn, r.checkOut, tripHours, isFinalized)
    if (r.status === 'present') entry.presentDays++
    else if (r.status === 'trip') entry.tripDays++
    else if (r.status === 'leave') entry.leaveDays++
    if (missingPunch) entry.missingPunchDays++
    entry.totalHours += hours
    // Average denominator = days that represent actual attendance, so a
    // finalized missing-punch present day (the person came but forgot to
    // punch) still dilutes the average instead of inflating it (Codex P2):
    //  - present day         → always counted (came to work, punched or not)
    //  - trip day            → counted only when the fixed hours are non-zero
    //  - leave with punches  → counted (half-day leave, still worked)
    //  - absent / leave-without-punch → excluded
    const counted =
      r.status === 'present' ||
      (r.status === 'trip' && hours > 0) ||
      (r.status === 'leave' && hours > 0)
    if (counted) entry.countedDays++
  }

  const summaryRows = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  const csv = buildSummaryCsv(summaryRows, scope.from, scope.to)
  const filename = `attendance-summary-${scope.from}_${scope.to}.csv`
  return new NextResponse(csv, { headers: csvAttachmentHeaders(filename) })
}
