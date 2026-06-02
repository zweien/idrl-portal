import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toPerson, toNewsItem, toResource, fromPerson, fromNewsItem, fromResource } from '@/lib/db/serialize'
import type { Person, NewsItem, Resource } from '@/lib/types'

interface AdminDataBody {
  personnel: Person[]
  news: NewsItem[]
  resources: Resource[]
}

export async function GET() {
  const [persons, news, resources] = await Promise.all([
    prisma.person.findMany(),
    prisma.newsItem.findMany({ orderBy: { date: 'desc' } }),
    prisma.resource.findMany(),
  ])
  return NextResponse.json({
    personnel: persons.map(toPerson),
    news: news.map(toNewsItem),
    resources: resources.map(toResource),
  })
}

export async function PUT(req: NextRequest) {
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
    // Delete + recreate all three tables
    await prisma.person.deleteMany({})
    await prisma.newsItem.deleteMany({})
    await prisma.resource.deleteMany({})

    await prisma.person.createMany({ data: body.personnel.map(fromPerson) })
    await prisma.newsItem.createMany({ data: body.news.map(fromNewsItem) })
    await prisma.resource.createMany({ data: body.resources.map(fromResource) })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
