import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toCategory } from '@/lib/db/serialize'
import { requireUser, requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import type { Category, CategoryKind, ApiResponse } from '@/lib/types'

/**
 * GET /api/categories?kind=news|resource
 * Returns categories of the given kind, ordered by `order` then name.
 */
export async function GET(req: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const kind = searchParams.get('kind') as CategoryKind | null

  const rows = await prisma.category.findMany({
    where: kind ? { kind } : undefined,
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  })
  const response: ApiResponse<Category[]> = { success: true, data: rows.map(toCategory) }
  return NextResponse.json(response)
}

/**
 * POST /api/categories
 * Create a category. Body: { name, kind, order? }.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  let body: { name?: string; kind?: CategoryKind; order?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body?.name || !body?.kind || (body.kind !== 'news' && body.kind !== 'resource')) {
    return NextResponse.json({ error: 'name and kind (news|resource) required' }, { status: 400 })
  }

  try {
    const created = await prisma.category.create({
      data: { name: body.name, kind: body.kind, order: body.order ?? 0 },
    })
    await logAction({
      ...actorFromAuth(auth),
      action: 'category.create', targetType: 'category', targetId: created.id,
      summary: `新建分类 ${body.name}（${body.kind}）`,
    })
    return NextResponse.json(toCategory(created), { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
