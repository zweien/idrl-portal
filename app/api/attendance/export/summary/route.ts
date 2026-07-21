import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildSummaryCsv, exportWorkHours, type SummaryRow } from '@/lib/attendance'
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
    const { hours, missingPunch } = exportWorkHours(r.status, r.checkIn, r.checkOut, tripHours)
    if (r.status === 'present') entry.presentDays++
    else if (r.status === 'trip') entry.tripDays++
    else if (r.status === 'leave') entry.leaveDays++
    if (missingPunch) entry.missingPunchDays++
    entry.totalHours += hours
    // A day counts toward the average denominator only if it yielded actual
    // hours (present/leave with full punches, or a trip day with a non-zero
    // configured fixed value). Keeps the average meaningful when trip is
    // configured to 0 ("trip doesn't count").
    if (hours > 0) entry.countedDays++
  }

  const summaryRows = [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  const csv = buildSummaryCsv(summaryRows, scope.from, scope.to)
  const filename = `attendance-summary-${scope.from}_${scope.to}.csv`
  return new NextResponse(csv, { headers: csvAttachmentHeaders(filename) })
}
