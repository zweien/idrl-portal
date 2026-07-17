import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireScope } from '@/lib/auth-api'
import { syncMembers } from '@/lib/dingtalk-sync'
import type { SyncSource } from '@/lib/types'

/**
 * POST /api/dingtalk/sync-members
 * Fetch all members under DINGTALK_DEPT_ID and upsert them into Person
 * (keyed by unionid → Person.dingUserId). Also links any existing
 * User(provider="dingtalk") whose externalId matches a synced Person.
 *
 * Auth: admin session OR an API key with the `sync:members` scope. The source
 * of the call (api/manual) is recorded in the SyncLog.
 */
export async function POST(req: Request) {
  const auth = await requireScope(req, 'sync:members')
  if (auth instanceof NextResponse) return auth

  const source: SyncSource = req.headers.get('authorization')?.startsWith('Bearer ')
    ? 'api'
    : 'manual'
  try {
    const result = await syncMembers()
    await prisma.syncLog.create({
      data: {
        job: 'sync-members',
        source,
        status: 'success',
        stats: JSON.stringify(result),
      },
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    await prisma.syncLog.create({
      data: { job: 'sync-members', source, status: 'error', message: msg },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
