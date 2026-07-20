import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-api'
import { restoreBackup } from '@/lib/backup'

/**
 * POST /api/backup/restore — restore a backup over the live DB.
 * Body: { filename }. Always takes a pre-restore snapshot first, so a bad
 * restore can be undone. Admin-only.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  let body: { filename?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body?.filename) {
    return NextResponse.json({ error: 'filename required' }, { status: 400 })
  }
  try {
    const { preRestore } = await restoreBackup(body.filename)
    return NextResponse.json({
      success: true,
      data: { restored: body.filename, preRestoreSnapshot: preRestore.filename },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
