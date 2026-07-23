import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireScope } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'

/**
 * POST /api/news/reorder — set the manual order of the pinned group.
 * Body: `{ ids: string[] }` — the complete ordered list of pinned item ids.
 * Orders are rewritten to 0..n-1 by position (splice + normalize, same
 * philosophy as floor-layout zone ordering). Unpinned items always sort by
 * date desc and are not affected.
 */
export async function POST(req: NextRequest) {
  const auth = await requireScope(req, 'news:publish')
  if (auth instanceof NextResponse) return auth

  let body: { ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!Array.isArray(body?.ids) || body.ids.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids must be a string array' }, { status: 400 })
  }
  const ids = body.ids as string[]
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'ids must not contain duplicates' }, { status: 400 })
  }

  const rows = await prisma.newsItem.findMany({ where: { id: { in: ids } } })
  if (rows.length !== ids.length) {
    return NextResponse.json({ error: 'some ids do not exist' }, { status: 400 })
  }
  if (rows.some(r => !r.pinned)) {
    return NextResponse.json({ error: 'only pinned items can be reordered' }, { status: 400 })
  }

  await prisma.$transaction(ids.map((id, i) =>
    prisma.newsItem.update({ where: { id }, data: { order: i } }),
  ))
  void logAction({
    ...actorFromAuth(auth),
    action: 'news.reorder', targetType: 'news', targetId: ids[0] ?? '-',
    summary: `调整置顶动态顺序（${ids.length} 条）`,
  })
  return NextResponse.json({ ok: true })
}
