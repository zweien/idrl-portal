import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toPerson, toNewsItem, toResource, fromPerson, fromNewsItem, fromResource } from '@/lib/db/serialize'
import { requireUser, requireAdmin } from '@/lib/auth-api'
import type { Person, NewsItem, Resource } from '@/lib/types'

interface AdminDataBody {
  personnel: Person[]
  news: NewsItem[]
  resources: Resource[]
}

export async function GET() {
  const session = await requireUser()
  if (session instanceof NextResponse) return session

  const isAdmin = session.role === 'admin'
  const [persons, news, resources] = await Promise.all([
    prisma.person.findMany(),
    // Non-admins only see published news; admins see drafts too.
    prisma.newsItem.findMany({
      where: isAdmin ? undefined : { status: 'published' },
      orderBy: { date: 'desc' },
    }),
    // accessLevel enforcement mirrors /api/resources: non-admins can't see admin-only.
    prisma.resource.findMany({ where: isAdmin ? undefined : { accessLevel: { not: 'admin' } } }),
  ])
  return NextResponse.json({
    personnel: persons.map(toPerson),
    news: news.map(toNewsItem),
    resources: resources.map(toResource),
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  let body: AdminDataBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body?.personnel || !body?.news || !body?.resources) {
    return NextResponse.json({ error: 'personnel, news, resources required' }, { status: 400 })
  }

  try {
    // Atomic replace: delete + recreate all three tables in one transaction.
    await prisma.$transaction(async (tx) => {
      await tx.person.deleteMany({})
      await tx.newsItem.deleteMany({})
      await tx.resource.deleteMany({})

      await tx.person.createMany({ data: body.personnel.map(fromPerson) })
      await tx.newsItem.createMany({ data: body.news.map(fromNewsItem) })
      await tx.resource.createMany({ data: body.resources.map(fromResource) })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
