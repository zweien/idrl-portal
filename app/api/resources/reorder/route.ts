import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireScope } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'

/**
 * POST /api/resources/reorder — set the manual order within one category.
 * Body: `{ ids: string[] }` — the complete ordered list of resource ids in a
 * single category (uncategorized resources form their own group). Orders are
 * rewritten to 0..n-1 by position.
 */
export async function POST(req: NextRequest) {
  const auth = await requireScope(req, 'resource:publish')
  if (auth instanceof NextResponse) return auth

  let body: { ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!Array.isArray(body?.ids) || body.ids.length === 0 || body.ids.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids must be a non-empty string array' }, { status: 400 })
  }
  const ids = body.ids as string[]
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'ids must not contain duplicates' }, { status: 400 })
  }

  const rows = await prisma.resource.findMany({ where: { id: { in: ids } } })
  if (rows.length !== ids.length) {
    return NextResponse.json({ error: 'some ids do not exist' }, { status: 400 })
  }
  const categories = new Set(rows.map(r => r.categoryId))
  if (categories.size !== 1) {
    return NextResponse.json({ error: 'ids must belong to a single category' }, { status: 400 })
  }
  // The contract requires the COMPLETE category membership; accepting a subset
  // would leave omitted rows with stale `order` values that collide with the
  // rewritten 0..n-1 range and make the id tiebreak decide display order.
  const categoryId = rows[0].categoryId ?? null
  const siblings = await prisma.resource.findMany({ where: { categoryId }, select: { id: true } })
  const supplied = new Set(ids)
  if (siblings.length !== ids.length || siblings.some(r => !supplied.has(r.id))) {
    return NextResponse.json({ error: 'ids must include all resources in the category' }, { status: 400 })
  }

  await prisma.$transaction(ids.map((id, i) =>
    prisma.resource.update({ where: { id }, data: { order: i } }),
  ))
  void logAction({
    ...actorFromAuth(auth),
    action: 'resource.reorder', targetType: 'resource', targetId: ids[0],
    summary: `调整资源顺序（${ids.length} 个）`,
  })
  return NextResponse.json({ ok: true })
}
