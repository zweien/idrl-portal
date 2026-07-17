import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toNewsItem, fromNewsItem } from '@/lib/db/serialize'
import { requireUserOrScope, requireScope } from '@/lib/auth-api'
import type { NewsItem, ApiResponse, PaginatedResponse } from '@/lib/types'

export async function GET(request: Request) {
  const session = await requireUserOrScope(request, 'news:read')
  if (session instanceof NextResponse) return session

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const category = searchParams.get('category')
  const pinned = searchParams.get('pinned')
  const search = searchParams.get('search')
  const isAdmin = session.role === 'admin'

  const where: { categoryId?: string; status?: string; OR?: Array<Record<string, unknown>> } = {}
  if (category) where.categoryId = category
  // Non-admins only see published items; admins see drafts too.
  if (!isAdmin) where.status = 'published'
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

  // Sort: pinned first, then date desc
  rows.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const total = rows.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const items = rows.slice(start, start + pageSize)

  const response: ApiResponse<PaginatedResponse<NewsItem>> = {
    success: true,
    data: { items, total, page, pageSize, totalPages },
  }
  return NextResponse.json(response)
}

export async function POST(req: NextRequest) {
  const auth = await requireScope(req, 'news:publish')
  if (auth instanceof NextResponse) return auth

  let body: Partial<NewsItem>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body?.title || !body?.content || !body?.date) {
    return NextResponse.json({ error: 'title, content, date required' }, { status: 400 })
  }

  const id = `n-${Date.now()}`
  const created = await prisma.newsItem.create({
    data: fromNewsItem({ ...(body as NewsItem), id }),
  })
  return NextResponse.json(toNewsItem(created), { status: 201 })
}
