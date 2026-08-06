import { safeErrorResponse } from '@/lib/safe-error'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-api'
import { createBackup, listBackups, deleteBackup, pruneBackups, readKeepCount } from '@/lib/backup'
import { logAction, actorFromAuth } from '@/lib/audit'
import type { ApiResponse } from '@/lib/types'

/** GET /api/backup — list all backups (newest first). */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const backups = listBackups()
  const keep = await readKeepCount()
  const res: ApiResponse<{ backups: typeof backups; keep: number }> = {
    success: true,
    data: { backups, keep },
  }
  return NextResponse.json(res)
}

/** POST /api/backup — create a manual backup, then prune to retention. */
export async function POST() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const info = await createBackup('manual')
    const keep = await readKeepCount()
    pruneBackups(keep)
    void logAction({
      ...actorFromAuth(auth),
      action: 'backup.create', targetType: 'backup',
      summary: `手动备份（${info.sizeKb} KB）`,
    })
    return NextResponse.json({ success: true, data: info })
  } catch (e) {
    console.error('backup failed:', e)
    return safeErrorResponse(e, 500)
  }
}

/** DELETE /api/backup?filename=X — delete one backup. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const filename = new URL(req.url).searchParams.get('filename')
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 })
  try {
    deleteBackup(filename)
    void logAction({
      ...actorFromAuth(auth),
      action: 'backup.delete', targetType: 'backup', targetId: filename,
      summary: `删除备份 ${filename}`,
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('backup failed:', e)
    return safeErrorResponse(e, 400)
  }
}
