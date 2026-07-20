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

  const updated = await prisma.newsItem.update({
    where: { id },
    data: fromNewsItem({ ...(toNewsItem(existing)), ...(body as NewsItem), id }),
  })
  await logAction({
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
  await logAction({
    ...actorFromAuth(auth),
    action: 'news.delete', targetType: 'news', targetId: id,
    summary: `删除动态 ${id}`,
  })
  return NextResponse.json({ ok: true })
}
