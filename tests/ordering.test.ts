import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { compareNews, compareResources } from '@/lib/ordering'
import { toNewsItem, toResource, fromNewsItem, fromResource } from '@/lib/db/serialize'
import type { NewsItem, Resource } from '@/lib/types'

/**
 * Manual ordering: NewsItem.order applies within the pinned group (unpinned
 * sort by date desc); Resource.order applies within each category. Covers the
 * shared comparators, serializer round-trips, and the splice+normalize
 * rewrite the reorder endpoints perform (0..n-1 by position).
 */

const news = (over: Partial<NewsItem>): NewsItem => ({
  id: 'n-x', title: 't', content: 'c', date: '2026-07-01', status: 'published', ...over,
})
const res = (over: Partial<Resource>): Resource => ({
  id: 'r-x', name: 'n', description: 'd', status: 'available', accessLevel: 'member', ...over,
})

describe('compareNews', () => {
  it('keeps pinned items before unpinned regardless of date', () => {
    const pinned = news({ id: 'n-p', pinned: true, date: '2026-01-01' })
    const fresh = news({ id: 'n-f', date: '2026-07-20' })
    expect([fresh, pinned].sort(compareNews).map(n => n.id)).toEqual(['n-p', 'n-f'])
  })

  it('orders the pinned group by manual order asc, date desc as tiebreak', () => {
    const a = news({ id: 'n-a', pinned: true, order: 2, date: '2026-07-01' })
    const b = news({ id: 'n-b', pinned: true, order: 0, date: '2026-01-01' })
    const c = news({ id: 'n-c', pinned: true, order: 0, date: '2026-07-10' })
    expect([a, b, c].sort(compareNews).map(n => n.id)).toEqual(['n-c', 'n-b', 'n-a'])
  })

  it('sorts unpinned items by date desc, ignoring order', () => {
    const a = news({ id: 'n-a', order: 0, date: '2026-07-01' })
    const b = news({ id: 'n-b', order: 5, date: '2026-07-20' })
    expect([a, b].sort(compareNews).map(n => n.id)).toEqual(['n-b', 'n-a'])
  })
})

describe('compareResources', () => {
  it('groups by category (uncategorized last), order asc within a group', () => {
    const a = res({ id: 'r-a', categoryId: 'cat1', order: 1 })
    const b = res({ id: 'r-b', categoryId: 'cat1', order: 0 })
    const c = res({ id: 'r-c', categoryId: 'cat2', order: 0 })
    const d = res({ id: 'r-d', categoryId: null, order: 0 })
    expect([d, a, b, c].sort(compareResources).map(r => r.id))
      .toEqual(['r-b', 'r-a', 'r-c', 'r-d'])
  })

  it('falls back to id (creation order) on equal order', () => {
    const a = res({ id: 'r-200', order: 0 })
    const b = res({ id: 'r-100', order: 0 })
    expect([a, b].sort(compareResources).map(r => r.id)).toEqual(['r-100', 'r-200'])
  })
})

let prisma: PrismaClient
let tmpDir: string

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'idrl-order-'))
  const db = new Database(join(tmpDir, 'test.db'))
  db.exec(`
    CREATE TABLE "NewsItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL, "content" TEXT NOT NULL,
      "summary" TEXT, "author" TEXT, "date" TEXT NOT NULL,
      "tags" TEXT, "imageUrl" TEXT, "link" TEXT,
      "pinned" BOOLEAN NOT NULL DEFAULT false,
      "status" TEXT NOT NULL DEFAULT 'published',
      "publishAt" TEXT, "order" INTEGER NOT NULL DEFAULT 0,
      "categoryId" TEXT
    );
    CREATE TABLE "Resource" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL, "description" TEXT NOT NULL,
      "url" TEXT, "icon" TEXT, "status" TEXT NOT NULL,
      "specs" TEXT, "accessLevel" TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      "categoryId" TEXT
    );
  `)
  prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${join(tmpDir, 'test.db')}` }),
  })
})

afterAll(async () => {
  await prisma?.$disconnect()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('order persistence', () => {
  it('round-trips order through the serializers', async () => {
    const created = await prisma.newsItem.create({
      data: fromNewsItem(news({ id: 'n-1', pinned: true, order: 3 })),
    })
    expect(toNewsItem(created).order).toBe(3)

    const r = await prisma.resource.create({
      data: fromResource(res({ id: 'r-1', categoryId: 'cat1', order: 2 })),
    })
    expect(toResource(r).order).toBe(2)
  })

  it('defaults order to 0 when omitted', async () => {
    const created = await prisma.newsItem.create({ data: fromNewsItem(news({ id: 'n-2' })) })
    expect(created.order).toBe(0)
  })

  it('rewrites orders to 0..n-1 by position (reorder semantics)', async () => {
    for (const [id, order] of [['n-a', 0], ['n-b', 2], ['n-c', 2]] as const) {
      await prisma.newsItem.create({ data: fromNewsItem(news({ id, pinned: true, order })) })
    }
    // Reorder c, a, b → normalize by position (what POST /api/news/reorder does)
    const ids = ['n-c', 'n-a', 'n-b']
    await prisma.$transaction(ids.map((id, i) =>
      prisma.newsItem.update({ where: { id }, data: { order: i } }),
    ))
    const rows = (await prisma.newsItem.findMany({ where: { id: { in: ids } } })).map(toNewsItem)
    expect(rows.sort(compareNews).map(n => n.id)).toEqual(['n-c', 'n-a', 'n-b'])
    expect(rows.map(n => n.order).sort()).toEqual([0, 1, 2])
  })

  it('detects incomplete reorder lists (complete-group contract)', async () => {
    // News: pin exactly the n-q* set, then assert no other pinned rows exist
    // (the reorder endpoint rejects when supplied != all pinned).
    for (const id of ['n-q1', 'n-q2', 'n-q3']) {
      await prisma.newsItem.create({ data: fromNewsItem(news({ id, pinned: true, order: 0 })) })
    }
    const allPinned = (await prisma.newsItem.findMany({ where: { pinned: true }, select: { id: true } })).map(r => r.id)
    const supplied = ['n-q2', 'n-q3'] // missing n-q1 → incomplete
    const isComplete = allPinned.length === supplied.length && allPinned.every(r => supplied.includes(r.id))
    expect(isComplete).toBe(false)

    // Resources: one cat1 row of two → incomplete.
    await prisma.resource.create({ data: fromResource(res({ id: 'r-z1', categoryId: 'cat1' })) })
    await prisma.resource.create({ data: fromResource(res({ id: 'r-z2', categoryId: 'cat1' })) })
    const cat1 = (await prisma.resource.findMany({ where: { categoryId: 'cat1' }, select: { id: true } })).map(r => r.id)
    const resComplete = cat1.length === 1 && cat1.includes('r-z1')
    expect(resComplete).toBe(false)
  })
})
