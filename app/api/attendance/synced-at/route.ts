import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth-api'
import type { ApiResponse } from '@/lib/types'

/**
 * GET /api/attendance/synced-at — freshness signal for the personnel and
 * attendance pages: when did sync-attendance last run, and did it succeed?
 *
 * Member-readable (any logged-in user): seeing "data is 3h old" is exactly
 * what a member needs to judge staleness of the presence board, and the
 * payload is only a timestamp + status — the full sync logs (with error
 * messages and stats) stay admin-only on /api/sync-logs.
 */
export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const last = await prisma.syncLog.findFirst({
    where: { job: 'sync-attendance' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, status: true },
  })

  const data = last
    ? { lastSyncAt: last.createdAt.toISOString(), status: last.status as 'success' | 'error' }
    : { lastSyncAt: null, status: null }

  const response: ApiResponse<{ lastSyncAt: string | null; status: 'success' | 'error' | null }> = {
    success: true,
    data,
  }
  return NextResponse.json(response)
}
