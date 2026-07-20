import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { requireAdmin } from '@/lib/auth-api'
import { backupPath } from '@/lib/backup'

/** GET /api/backup/download?filename=X — download a backup file. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const filename = new URL(req.url).searchParams.get('filename')
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 })
  let path: string
  try {
    path = backupPath(filename)
  } catch {
    return NextResponse.json({ error: 'invalid filename' }, { status: 400 })
  }
  try {
    const buf = await readFile(path)
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'backup not found' }, { status: 404 })
  }
}
