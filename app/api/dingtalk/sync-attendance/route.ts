import { assertSameOrigin } from '@/lib/csrf'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireScope } from '@/lib/auth-api'
import { syncAttendance, flattenAttendanceStats } from '@/lib/dingtalk-sync'
import { runSyncTask } from '@/lib/sync-task'
import { toSafeError } from '@/lib/safe-error'
import type { SyncSource } from '@/lib/types'

/**
 * POST /api/dingtalk/sync-attendance
 * Fetch today's attendance/leave/trip for all synced DingTalk persons and
 * update their status per the priority: trip > leave > present > absent.
 *
 * Auth: admin session OR an API key with the `sync:attendance` scope. The
 * source of the call (api/manual) is recorded in the SyncLog.
 *
 * Execution: a cookie-session (manual) call starts a BACKGROUND sync task and
 * returns its state immediately — the client polls GET /api/sync/status for
 * stage progress instead of hanging the HTTP request for ~80s. A Bearer-key
 * (api) call runs INLINE under the same global mutex, keeping the documented
 * blocking stats response for machine consumers. Either way a second start
 * while one is running returns 409 with the live task state.
 */
export async function POST(req: Request) {
  const __csrf = assertSameOrigin(req)
  if (__csrf) return __csrf
  const auth = await requireScope(req, 'sync:attendance')
  if (auth instanceof NextResponse) return auth

  const source: SyncSource = req.headers.get('authorization')?.startsWith('Bearer ')
    ? 'api'
    : 'manual'
  const background = source === 'manual'

  // Full syncAttendance result for the inline machine contract; captured from
  // the task closure (see the runSyncTask call below).
  let full: Awaited<ReturnType<typeof syncAttendance>> | null = null

  const res = await runSyncTask('attendance', async (progress) => {
    let result: Awaited<ReturnType<typeof syncAttendance>>
    try {
      result = await syncAttendance(progress)
    } catch (e) {
      const { message: msg } = toSafeError(e)
      await prisma.syncLog.create({
        data: { job: 'sync-attendance', source, status: 'error', message: msg },
      })
      throw new Error(msg)
    }
    full = result
    await prisma.syncLog.create({
      data: {
        job: 'sync-attendance',
        source,
        status: 'success',
        // Flatten so the log row doesn't carry the nested {stats:{...}} shape.
        stats: JSON.stringify(flattenAttendanceStats(result)),
      },
    })
    const s = result.stats
    return {
      summary: `考勤同步完成：在位 ${s.present}，出差 ${s.trip}，请假 ${s.leave}，未到 ${s.absent}（共 ${result.total} 人）`,
      stats: flattenAttendanceStats(result),
    }
  }, { background })

  if (!res.ok) {
    if (res.reason === 'already-running') {
      return NextResponse.json(
        { error: '已有同步任务进行中，请等待其完成', task: res.task },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: res.task.error ?? '同步失败', task: res.task }, { status: 500 })
  }
  if (background) {
    return NextResponse.json({ taskId: res.task.id, task: res.task })
  }
  // Inline (api-key) contract: the full syncAttendance result.
  return NextResponse.json(full)
}
