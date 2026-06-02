import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toNewsItem } from '@/lib/db/serialize'
import type { NewsItem, ApiResponse, PaginatedResponse } from '@/lib/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const type = searchParams.get('type')
  const pinned = searchParams.get('pinned')
  const search = searchParams.get('search')

  const where: { type?: string; OR?: Array<Record<string, unknown>> } = {}
  if (type) where.type = type
  if (search) {
    const q = { contains: search }
    where.OR = [{ title: q }, { content: q }]
    // tags filter in memory (JSON column)
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

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'POST /api/news disabled. Use PUT /api/admin-data.' },
    { status: 405 },
  )
}
