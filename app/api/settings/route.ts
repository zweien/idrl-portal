import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import { isValidCron } from '@/lib/scheduler'
import { logAction, actorFromAuth } from '@/lib/audit'
import type { Setting, ApiResponse } from '@/lib/types'

/** GET /api/settings — all key/value settings. */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const rows = await prisma.setting.findMany()
  const data: Record<string, string> = {}
  for (const r of rows) data[r.key] = r.value
  return NextResponse.json({ success: true, data } satisfies ApiResponse<Record<string, string>>)
}

/**
 * PATCH /api/settings — upsert key/value pairs. Body: { key1: value1, ... }.
 * Used by the scheduling panel to update cron expressions / enable flags.
 */
export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Validate the entire payload first so a multi-key PATCH is atomic: if any
  // value is invalid we return 400 having written nothing, rather than leaving
  // a partial update active while the panel reports a failed save.
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== 'string') {
      return NextResponse.json({ error: `value for ${key} must be a string` }, { status: 400 })
    }
    // cron.* keys hold cron expressions; reject malformed (including empty)
    // ones up front so the admin sees the error instead of a silent
    // "saved but never runs" job. An empty value would otherwise persist ''
    // and override the default.
    if (key.startsWith('cron.') && !key.startsWith('cron.enabled')) {
      if (value === '' || !isValidCron(value)) {
        return NextResponse.json({ error: `invalid cron expression for ${key}: ${value || '(empty)'}` }, { status: 400 })
      }
    }
  }
  for (const [key, value] of Object.entries(body)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }
  const changedKeys = Object.keys(body)
  await logAction({
    ...actorFromAuth(auth),
    action: 'settings.update', targetType: 'settings',
    summary: `修改配置: ${changedKeys.join(', ')}`,
  })
  const response: ApiResponse<Setting[]> = { success: true }
  return NextResponse.json(response)
}
