import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth-api'
import { computeWorkMinutes, todayDateStr, monthStart } from '@/lib/attendance'
import type { ApiResponse } from '@/lib/types'

export interface LeaderboardEntry {
  personId: string
  name: string
  /** "today" view: earliest OnDuty punch "HH:mm". */
  checkIn?: string | null
  /** "monthly" view: total work minutes this month (null days excluded). */
  workMinutes?: number | null
}

/**
 * GET /api/attendance/leaderboard?type=today|monthly&limit=N
 *
 * Public to any logged-in user (the early-bird board is meant to motivate).
 * - type=today:   people with an OnDuty punch today, ordered earliest first.
 * - type=monthly: people's summed work minutes this month (present days only),
 *                 ordered by total descending.
 */
export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') === 'monthly' ? 'monthly' : 'today'
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10'), 1), 100)

  if (type === 'today') {
    const today = todayDateStr()
    const rows = await prisma.attendanceRecord.findMany({
      where: { date: today, checkIn: { not: null } },
      orderBy: { checkIn: 'asc' },
      take: limit,
      include: { person: { select: { name: true } } },
    })
    const items: LeaderboardEntry[] = rows.map(r => ({
      personId: r.personId,
      name: r.person.name,
      checkIn: r.checkIn,
    }))
    const res: ApiResponse<{ type: 'today'; date: string; items: LeaderboardEntry[] }> = {
      success: true,
      data: { type, date: today, items },
    }
    return NextResponse.json(res)
  }

  // monthly: sum work minutes across present days in the current month.
  const start = monthStart(todayDateStr())
  const today = todayDateStr()
  const rows = await prisma.attendanceRecord.findMany({
    where: { date: { gte: start, lte: today } },
    select: {
      personId: true,
      checkIn: true,
      checkOut: true,
      status: true,
      person: { select: { name: true } },
    },
  })

  // Aggregate per person. Only present days with a computable work span count.
  const totals = new Map<string, { name: string; workMinutes: number; countedDays: number }>()
  for (const r of rows) {
    if (r.status !== 'present') continue
    const m = computeWorkMinutes(r.checkIn, r.checkOut)
    if (m === null) continue
    let entry = totals.get(r.personId)
    if (!entry) {
      entry = { name: r.person.name, workMinutes: 0, countedDays: 0 }
      totals.set(r.personId, entry)
    }
    entry.workMinutes += m
    entry.countedDays += 1
  }
  const items: LeaderboardEntry[] = [...totals.entries()]
    .map(([personId, e]) => ({ personId, name: e.name, workMinutes: e.workMinutes }))
    .sort((a, b) => (b.workMinutes ?? 0) - (a.workMinutes ?? 0))
    .slice(0, limit)

  const res: ApiResponse<{ type: 'monthly'; from: string; to: string; items: LeaderboardEntry[] }> = {
    success: true,
    data: { type, from: start, to: today, items },
  }
  return NextResponse.json(res)
}
