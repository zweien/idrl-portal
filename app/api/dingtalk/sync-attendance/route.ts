import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireScope } from '@/lib/auth-api'
import { syncAttendance } from '@/lib/dingtalk-sync'
import type { SyncSource } from '@/lib/types'

/**
 * POST /api/dingtalk/sync-attendance
 * Fetch today's attendance/leave/trip for all synced DingTalk persons and
 * update their status per the priority: trip > leave > present > absent.
 *
 * Auth: admin session OR an API key with the `sync:attendance` scope. The
 * source of the call (api/manual) is recorded in the SyncLog.
 */
export async function POST(req: Request) {
  const auth = await requireScope(req, 'sync:attendance')
  if (auth instanceof NextResponse) return auth

  const source: SyncSource = req.headers.get('authorization')?.startsWith('Bearer ')
    ? 'api'
    : 'manual'
  try {
    const result = await syncAttendance()
    await prisma.syncLog.create({
      data: {
        job: 'sync-attendance',
        source,
        status: 'success',
        stats: JSON.stringify(result),
      },
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    await prisma.syncLog.create({
      data: { job: 'sync-attendance', source, status: 'error', message: msg },
    })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
