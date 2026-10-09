import { assertSameOrigin } from '@/lib/csrf'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import { backfillDay } from '@/lib/dingtalk-sync'
import { runSyncTask } from '@/lib/sync-task'
import { toSafeError } from '@/lib/safe-error'

/**
 * POST /api/attendance/backfill?date=YYYY-MM-DD
 *
 * Admin-only emergency re-pull of a single day from DingTalk. Re-runs the
 * same fetch + upsert flow the regular sync uses, but for one day only, and
 * does NOT advance the finalize water mark. Used when a day's data is missing
 * or wrong (e.g. a sync failed and the window has moved on).
 *
 * Cookie callers get a background task (progress via GET /api/sync/status);
 * the global mutex applies as for the other sync entry points.
 */
export async function POST(req: Request) {
  const __csrf = assertSameOrigin(req)
  if (__csrf) return __csrf
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  const res = await runSyncTask('backfill', async (progress) => {
    let result: Awaited<ReturnType<typeof backfillDay>>
    try {
      result = await backfillDay(date, progress)
    } catch (e) {
      const { message: msg } = toSafeError(e)
      await prisma.syncLog.create({
        // Distinct job name so a failed HISTORICAL backfill doesn't pollute the
        // sync-attendance freshness signal (a backfill isn't a board sync run).
        data: { job: 'attendance-backfill', source: 'manual', status: 'error', message: `backfill ${date}: ${msg}` },
      })
      throw new Error(msg)
    }
    void logAction({
      ...actorFromAuth(auth),
      action: 'attendance.backfill',
      targetType: 'attendance',
      targetId: date,
      summary: `补拉考勤 ${date}（${result.upserted} 人）`,
    })
    return {
      summary: `补拉 ${date} 完成：${result.upserted} 条记录`,
      stats: result as unknown as Record<string, unknown>,
    }
  }, { background: true })

  if (!res.ok) {
    if (res.reason === 'already-running') {
      return NextResponse.json(
        { error: '已有同步任务进行中，请等待其完成', task: res.task },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: res.task.error ?? '补拉失败', task: res.task }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: { date, upserted: res.result.stats?.upserted as number }, taskId: res.task.id })
}
