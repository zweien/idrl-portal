import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-api'
import { getSyncTask } from '@/lib/sync-task'

/**
 * GET /api/sync/status
 *
 * Progress of the latest sync task (in-process registry). Any authenticated
 * user may read it — the state carries stage names/counters only, no
 * sensitive data. Returns { task: null } when nothing has run since the last
 * process start; a client that started a task and then sees null knows the
 * process restarted mid-sync ("interrupted, please retry").
 */
export async function GET(req: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  // ?id= reads a SPECIFIC task: a polling client keeps reading its own task
  // even after another admin started a newer one (the default no-id form
  // returns the latest).
  const id = new URL(req.url).searchParams.get('id') ?? undefined
  return NextResponse.json({ task: getSyncTask(id) })
}
