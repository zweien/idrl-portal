import { assertSameOrigin } from '@/lib/csrf'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toNewsItem, fromNewsItem } from '@/lib/db/serialize'
import { compareNews } from '@/lib/ordering'
import { requireUserOrScopeAny, requireScope } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import { createNewsBodySchema } from '@/lib/validation'
import { parsePagination, paginate, totalPages as computeTotalPages } from '@/lib/pagination'
import type { NewsItem, ApiResponse, PaginatedResponse } from '@/lib/types'

export async function GET(request: Request) {
  // admin-scope keys authenticate as admin, so includeDrafts applies to them
  // (agent draft review); plain news:read keys stay member (drafts hidden).
  const session = await requireUserOrScopeAny(request, ['news:read', 'admin'])
  if (session instanceof NextResponse) return session

  const { searchParams } = new URL(request.url)
  const { page, pageSize } = parsePagination(searchParams)
  const category = searchParams.get('category')
  const pinned = searchParams.get('pinned')
  const search = searchParams.get('search')
  const isAdmin = session.role === 'admin'
  // Drafts are opt-in: only the admin management table passes includeDrafts=1.
  // The reader feed (/dashboard/news) and /api/admin-data hide drafts even for
  // admins, so publication-facing views never show unpublished items.
  const includeDrafts = isAdmin && searchParams.get('includeDrafts') === '1'

  const where: { categoryId?: string; status?: string; OR?: Array<Record<string, unknown>> } = {}
  if (category) where.categoryId = category
  if (!includeDrafts) where.status = 'published'
  if (search) {
    const q = { contains: search }
    where.OR = [{ title: q }, { content: q }]
  }

  let rows = (await prisma.newsItem.findMany({ where })).map(toNewsItem)

  // In-memory: pinned filter
  if (pinned === 'true') {
    rows = rows.filter(n => n.pinned)
  }

  // In-memory: tags search
  if (search) {
    const query = search.toLowerCase()
    rows = rows.filter(n =>
      n.title.toLowerCase().includes(query) ||
      n.content.toLowerCase().includes(query) ||
      n.tags?.some(tag => tag.toLowerCase().includes(query)),
    )
  }

  // Sort: pinned first (manual order asc, date desc as tiebreak), then date desc
  rows.sort(compareNews)

  const total = rows.length
  const tp = computeTotalPages(total, pageSize)
  const items = paginate(rows, { page, pageSize })

  const response: ApiResponse<PaginatedResponse<NewsItem>> = {
    success: true,
    data: { items, total, page, pageSize, totalPages: tp },
  }
  return NextResponse.json(response)
}

export async function POST(req: NextRequest) {
  const __csrf = assertSameOrigin(req)
  if (__csrf) return __csrf
  const auth = await requireScope(req, 'news:publish')
  if (auth instanceof NextResponse) return auth

  let body: Partial<NewsItem>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  // Validate + strip unknown keys before the data reaches fromNewsItem/Prisma.
  const parsed = createNewsBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }
  body = parsed.data as unknown as Partial<NewsItem>

  const id = `n-${Date.now()}`
  // New pinned items land at the end of the pinned group; unpinned order is
  // irrelevant (that group sorts by date desc).
  let order = body.order ?? 0
  if (body.pinned && body.order === undefined) {
    const pinned = await prisma.newsItem.findMany({ where: { pinned: true }, select: { order: true } })
    order = pinned.reduce((max, n) => Math.max(max, n.order), -1) + 1
  }
  const created = await prisma.newsItem.create({
    data: fromNewsItem({ ...(body as NewsItem), id, order }),
  })
  void logAction({
    ...actorFromAuth(auth),
    action: 'news.create', targetType: 'news', targetId: id,
    summary: `${body.status === 'draft' ? '存草稿' : '发布动态'} ${body.title}`,
  })
  return NextResponse.json(toNewsItem(created), { status: 201 })
}
