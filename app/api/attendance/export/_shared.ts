import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth-api'

/**
 * Shared logic for the attendance export endpoints (detail + summary):
 * resolve the caller, enforce self-only for non-admins, and parse the
 * from/to date range. Returns either a ready-to-use scope or a NextResponse
 * error to return directly.
 */
export type ExportScope =
  | {
      ok: true
      /** undefined = all persons (admin only). */
      personId?: string
      from: string
      to: string
    }
  | { ok: false; response: NextResponse }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function resolveExportScope(request: Request): Promise<ExportScope> {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return { ok: false, response: auth }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'from and to are required (YYYY-MM-DD)' }, { status: 400 }),
    }
  }
  if (from > to) {
    return { ok: false, response: NextResponse.json({ error: 'from must be <= to' }, { status: 400 }) }
  }

  let personId = searchParams.get('personId') ?? undefined
  if (auth.role !== 'admin') {
    if (!auth.userId) {
      return { ok: false, response: NextResponse.json({ error: 'no linked person' }, { status: 403 }) }
    }
    const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { personId: true } })
    if (!me?.personId) {
      return { ok: false, response: NextResponse.json({ error: 'no linked person' }, { status: 403 }) }
    }
    personId = me.personId
  }

  return { ok: true, personId, from, to }
}

/** Content-Disposition header for a CSV download, with a UTF-8 filename. */
export function csvAttachmentHeaders(filename: string): Record<string, string> {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_')
  const utf8 = encodeURIComponent(filename)
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`,
  }
}

/** Read the configured trip work-hours (Setting `attendance.tripWorkHours`, default 8). */
export async function readTripWorkHours(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: 'attendance.tripWorkHours' } })
  const n = row ? parseFloat(row.value) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 8
}
