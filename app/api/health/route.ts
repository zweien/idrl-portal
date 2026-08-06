import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/health — liveness + readiness probe.
 *
 * Unauthenticated (health checks must succeed without a session) and
 * intentionally cheap: a single scalar SELECT confirms the DB connection is
 * usable. Returns 200 {status:'ok'} when the DB responds, 503 when it doesn't
 * (so pm2 / a deploy smoke check / a load balancer can act on the failure).
 *
 * The route is force-dynamic and runs in the nodejs runtime (lib/db needs the
 * better-sqlite3 native binding, unavailable in edge).
 */
export async function GET() {
  try {
    // Lowest-overhead probe: resolve a constant. Times out via the connection's
    // busy_timeout if the DB is wedged; throws on a corrupt/unreachable file.
    await prisma.setting.count()
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (e) {
    console.error('health check failed:', e)
    return NextResponse.json(
      { status: 'error', error: 'database unavailable' },
      { status: 503 },
    )
  }
}
