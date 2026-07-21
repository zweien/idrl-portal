import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth-api'
import { computeWorkMinutes } from '@/lib/attendance'
import type { ApiResponse, PaginatedResponse, AttendanceStatus } from '@/lib/types'

export interface AttendanceRecordItem {
  id: string
  date: string
  checkIn?: string | null
  checkOut?: string | null
  status: AttendanceStatus
  workMinutes: number | null
}

/**
 * GET /api/attendance/records?personId=&from=&to=&page=&pageSize=
 *
 * Per-person daily punch history, newest first. Non-admin callers can ONLY
 * query their own personId — the requested personId is overridden with the
 * one linked to their session User. Admins may query anyone.
 *
 * Returns workMinutes per day (checkOut − checkIn, no lunch deduction; null
 * for missing punches or overnight anomalies).
 */
export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const requestedPersonId = searchParams.get('personId')
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined
  const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
  const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') || '30'), 1), 200)

  // Resolve the caller's linked Person for self-only enforcement.
  const isAdmin = auth.role === 'admin'
  let personId = requestedPersonId ?? undefined
  if (!isAdmin) {
    if (!auth.userId) {
      return NextResponse.json({ error: 'no linked person' }, { status: 403 })
    }
    const me = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { personId: true },
    })
    if (!me?.personId) {
      return NextResponse.json({ error: 'no linked person' }, { status: 403 })
    }
    // Force self — ignore any personId the client sent.
    personId = me.personId
  }

  if (!personId) {
    return NextResponse.json({ error: 'personId required' }, { status: 400 })
  }

  const where: { personId: string; date?: { gte?: string; lte?: string } } = { personId }
  if (from || to) {
    where.date = {}
    if (from) where.date.gte = from
    if (to) where.date.lte = to
  }

  const [total, rows] = await Promise.all([
    prisma.attendanceRecord.count({ where }),
    prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const items: AttendanceRecordItem[] = rows.map(r => ({
    id: r.id,
    date: r.date,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    status: r.status as AttendanceStatus,
    workMinutes: computeWorkMinutes(r.checkIn, r.checkOut),
  }))

  const totalPages = Math.ceil(total / pageSize) || 1
  const res: ApiResponse<PaginatedResponse<AttendanceRecordItem>> = {
    success: true,
    data: { items, total, page, pageSize, totalPages },
  }
  return NextResponse.json(res)
}
