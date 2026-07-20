import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { requireAdmin } from '@/lib/auth-api'
import { BACKUP_DIR, restoreFromFile } from '@/lib/backup'

/**
 * POST /api/backup/upload — upload a .sqlite backup file and restore from it.
 * Accepts multipart FormData with a `file` field. Validates the file is a real
 * SQLite DB with our schema before overwriting (restoreFromFile does this),
 * and takes a pre-restore snapshot first. Admin-only.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: '文件未上传' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const filename = `upload-${Date.now()}.sqlite`
  const uploadPath = join(BACKUP_DIR, filename)
  // Ensure the backups dir exists (restoreFromFile also ensures, but we write first).
  const { mkdirSync, existsSync } = await import('node:fs')
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
  await writeFile(uploadPath, buf)

  try {
    const { preRestore } = await restoreFromFile(uploadPath)
    return NextResponse.json({
      success: true,
      data: { restored: filename, preRestoreSnapshot: preRestore.filename },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
