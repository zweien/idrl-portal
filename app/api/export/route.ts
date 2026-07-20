import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import {
  toPerson, toNewsItem, toResource, toCategory, toWorkstation, toZone, toFloor,
} from '@/lib/db/serialize'

/**
 * GET /api/export — export the 7 business tables as JSON (for analysis /
 * external use). Excludes auth/sensitive tables (User, ApiKey, SyncLog,
 * Setting). Triggers a download via Content-Disposition.
 *
 * Business tables: Floor, Zone, Workstation, Person, NewsItem, Resource,
 * Category.
 */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const [floors, zones, workstations, persons, news, resources, categories] = await Promise.all([
    prisma.floor.findMany({
      include: { zones: { include: { workstations: true } } },
      orderBy: { order: 'asc' },
    }),
    prisma.zone.findMany({ orderBy: { order: 'asc' } }),
    prisma.workstation.findMany(),
    prisma.person.findMany(),
    prisma.newsItem.findMany({ orderBy: { date: 'desc' } }),
    prisma.resource.findMany(),
    prisma.category.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    schema: 'idrl-portal-business-v1',
    tables: {
      floor: floors.map(toFloor),
      zone: zones.map(z => toZone({ ...z, workstations: [] })),
      workstation: workstations.map(toWorkstation),
      person: persons.map(toPerson),
      newsItem: news.map(toNewsItem),
      resource: resources.map(toResource),
      category: categories.map(toCategory),
    },
  }

  const dateStr = new Date().toISOString().slice(0, 10)
  const body = JSON.stringify(payload, null, 2)
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="idrl-export-${dateStr}.json"`,
    },
  })
}
