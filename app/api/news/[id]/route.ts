import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toNewsItem, fromNewsItem } from '@/lib/db/serialize'
import { requireAdmin } from '@/lib/auth-api'
import type { NewsItem } from '@/lib/types'

/** PATCH /api/news/:id — update a single news item. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  let body: Partial<NewsItem>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const existing = await prisma.newsItem.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const updated = await prisma.newsItem.update({
    where: { id },
    data: fromNewsItem({ ...(toNewsItem(existing)), ...(body as NewsItem), id }),
  })
  return NextResponse.json(toNewsItem(updated))
}

/** DELETE /api/news/:id — delete a single news item. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  try {
    await prisma.newsItem.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
