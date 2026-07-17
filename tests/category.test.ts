import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { toCategory } from '@/lib/db/serialize'

/**
 * Category model: unified news/resource categories. Verifies the (kind, name)
 * unique constraint allows the same name under different kinds but rejects
 * duplicates within a kind, and that toCategory maps fields correctly.
 */

let prisma: PrismaClient
let tmpDir: string

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'idrl-cat-'))
  const db = new Database(join(tmpDir, 'test.db'))
  db.exec(`
    CREATE TABLE "Category" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX "Category_kind_name_key" ON "Category"("kind", "name");
  `)
  prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${join(tmpDir, 'test.db')}` }),
  })
})

afterAll(async () => {
  await prisma?.$disconnect()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('Category (kind, name) uniqueness', () => {
  it('allows the same name under different kinds', async () => {
    await prisma.category.create({ data: { id: 'c1', name: 'paper', kind: 'news', order: 0 } })
    await prisma.category.create({ data: { id: 'c2', name: 'paper', kind: 'resource', order: 0 } })
    const count = await prisma.category.count({ where: { name: 'paper' } })
    expect(count).toBe(2)
  })

  it('rejects a duplicate (kind, name) pair', async () => {
    await expect(
      prisma.category.create({ data: { id: 'c3', name: 'paper', kind: 'news' } }),
    ).rejects.toThrow()
  })

  it('allows distinct names within the same kind', async () => {
    await prisma.category.create({ data: { id: 'c4', name: 'notice', kind: 'news', order: 1 } })
    await prisma.category.create({ data: { id: 'c5', name: 'event', kind: 'news', order: 2 } })
    const news = await prisma.category.findMany({ where: { kind: 'news' }, orderBy: { order: 'asc' } })
    expect(news.map(c => c.name)).toEqual(['paper', 'notice', 'event'])
  })
})

describe('toCategory serializer', () => {
  it('maps all fields and casts kind', () => {
    const row = {
      id: 'x1', name: 'compute', kind: 'resource', order: 3,
    }
    const cat = toCategory(row as never)
    expect(cat).toEqual({ id: 'x1', name: 'compute', kind: 'resource', order: 3 })
  })
})
