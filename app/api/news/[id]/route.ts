import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toNewsItem, fromNewsItem } from '@/lib/db/serialize'
import { requireScope } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import type { NewsItem } from '@/lib/types'

/** PATCH /api/news/:id — update a single news item. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireScope(req, 'news:publish')
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

  const merged = { ...(toNewsItem(existing)), ...(body as NewsItem), id }
  // Pinning an item appends it to the end of the pinned group (unless the
  // caller passed an explicit order).
  if (merged.pinned && !existing.pinned && body.order === undefined) {
    const pinned = await prisma.newsItem.findMany({ where: { pinned: true }, select: { order: true } })
    merged.order = pinned.reduce((max, n) => Math.max(max, n.order), -1) + 1
  }

  const updated = await prisma.newsItem.update({
    where: { id },
    data: fromNewsItem(merged),
  })
  void logAction({
    ...actorFromAuth(auth),
    action: 'news.update', targetType: 'news', targetId: id,
    summary: `编辑动态 ${body.title ?? toNewsItem(existing).title ?? id}`,
  })
  return NextResponse.json(toNewsItem(updated))
}

/** DELETE /api/news/:id — delete a single news item. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireScope(req, 'news:publish')
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  try {
    await prisma.newsItem.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  void logAction({
    ...actorFromAuth(auth),
    action: 'news.delete', targetType: 'news', targetId: id,
    summary: `删除动态 ${id}`,
  })
  return NextResponse.json({ ok: true })
}
