import { assertSameOrigin } from '@/lib/csrf'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireScope } from '@/lib/auth-api'
import { syncMembers } from '@/lib/dingtalk-sync'
import { runSyncTask } from '@/lib/sync-task'
import { toSafeError } from '@/lib/safe-error'
import type { SyncSource } from '@/lib/types'

/**
 * POST /api/dingtalk/sync-members
 * Fetch all members under DINGTALK_DEPT_ID and upsert them into Person
 * (keyed by unionid → Person.dingUserId). Also links any existing
 * User(provider="dingtalk") whose externalId matches a synced Person.
 *
 * Auth: admin session OR an API key with the `sync:members` scope. The source
 * of the call (api/manual) is recorded in the SyncLog.
 *
 * Execution matches sync-attendance: manual (cookie) callers get a background
 * task + GET /api/sync/status polling; api-key callers get the blocking stats
 * response. Both share the global one-sync-at-a-time mutex.
 */
export async function POST(req: Request) {
  const __csrf = assertSameOrigin(req)
  if (__csrf) return __csrf
  const auth = await requireScope(req, 'sync:members')
  if (auth instanceof NextResponse) return auth

  const source: SyncSource = req.headers.get('authorization')?.startsWith('Bearer ')
    ? 'api'
    : 'manual'
  const background = source === 'manual'

  let full: Awaited<ReturnType<typeof syncMembers>> | null = null

  const res = await runSyncTask('members', async (progress) => {
    let result: Awaited<ReturnType<typeof syncMembers>>
    try {
      result = await syncMembers(progress)
    } catch (e) {
      const { message: msg } = toSafeError(e)
      await prisma.syncLog.create({
        data: { job: 'sync-members', source, status: 'error', message: msg },
      })
      throw new Error(msg)
    }
    full = result
    await prisma.syncLog.create({
      data: {
        job: 'sync-members',
        source,
        status: 'success',
        stats: JSON.stringify(result),
      },
    })
    return {
      summary: `成员同步完成：共 ${result.total} 人，新建 ${result.created}，更新 ${result.updated}，关联登录 ${result.linked}` +
        (result.renamed > 0 ? `，钉钉重加账号修复 ${result.renamed} 人` : ''),
      stats: result as unknown as Record<string, unknown>,
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
  return NextResponse.json(full)
}
