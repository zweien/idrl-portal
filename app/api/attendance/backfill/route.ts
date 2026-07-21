import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import { backfillDay } from '@/lib/dingtalk-sync'

/**
 * POST /api/attendance/backfill?date=YYYY-MM-DD
 *
 * Admin-only emergency re-pull of a single day from DingTalk. Re-runs the
 * same fetch + upsert flow the regular sync uses, but for one day only, and
 * does NOT advance the finalize water mark. Used when a day's data is missing
 * or wrong (e.g. a sync failed and the window has moved on).
 */
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const result = await backfillDay(date)
    void logAction({
      ...actorFromAuth(auth),
      action: 'attendance.backfill',
      targetType: 'attendance',
      targetId: date,
      summary: `补拉考勤 ${date}（${result.upserted} 人）`,
    })
    return NextResponse.json({ success: true, data: { date, ...result } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    await prisma.syncLog.create({
      data: { job: 'sync-attendance', source: 'manual', status: 'error', message: `backfill ${date}: ${msg}` },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
