import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildDetailCsv, type ExportRow } from '@/lib/attendance'
import { resolveExportScope, csvAttachmentHeaders, readTripWorkHours } from '../_shared'

/**
 * GET /api/attendance/export/detail?from=&to=&personId=
 *
 * Per-day punch detail as a downloadable CSV (UTF-8 with BOM). One row per
 * (person, day) in the range. Hours use the export rules: trip → configured
 * fixed hours; leave → actual punches when present; missing-punch present
 * days labeled 在位(缺卡).
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
    orderBy: [{ date: 'asc' }, { person: { name: 'asc' } }],
    include: { person: { select: { name: true } } },
  })

  const exportRows: ExportRow[] = rows.map(r => ({
    name: r.person.name,
    date: r.date,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    status: r.status,
  }))

  const csv = buildDetailCsv(exportRows, tripHours)
  const filename = `attendance-detail-${scope.from}_${scope.to}.csv`
  return new NextResponse(csv, { headers: csvAttachmentHeaders(filename) })
}
