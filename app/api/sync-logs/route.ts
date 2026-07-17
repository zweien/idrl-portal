import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import type { SyncLog, ApiResponse } from '@/lib/types'

/**
 * GET /api/sync-logs?job=...&limit=50
 * Recent background-job audit entries (sync + publishing), newest first.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const job = searchParams.get('job')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

  const rows = await prisma.syncLog.findMany({
    where: job ? { job } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  const items: SyncLog[] = rows.map(r => ({
    id: r.id,
    job: r.job as SyncLog['job'],
    source: r.source as SyncLog['source'],
    status: r.status as SyncLog['status'],
    message: r.message ?? null,
    stats: r.stats ? (JSON.parse(r.stats) as Record<string, unknown>) : null,
    createdAt: r.createdAt.toISOString(),
  }))
  const response: ApiResponse<SyncLog[]> = { success: true, data: items }
  return NextResponse.json(response)
}
