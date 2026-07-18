import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * Person.role is free-text (DingTalk title verbatim). Blank roles are allowed
 * (display as "—"); the create flow must not reject an empty string. Uses a
 * throwaway SQLite so the test is hermetic.
 */
let prisma: PrismaClient
let tmpDir: string

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'idrl-role-'))
  const db = new Database(join(tmpDir, 'test.db'))
  db.exec(`
    CREATE TABLE "Person" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "email" TEXT,
      "phone" TEXT,
      "dingUserId" TEXT,
      "status" TEXT NOT NULL,
      "lastSeen" TEXT,
      "researchAreas" TEXT,
      "avatar" TEXT
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

describe('Person.role free-text (blank allowed)', () => {
  it('creates a person with a non-empty title', async () => {
    const p = await prisma.person.create({
      data: { id: 'p1', name: 'Alice', role: '研究员', status: 'present' },
    })
    expect(p.role).toBe('研究员')
  })

  it('creates a person with a blank role (displayed as "—")', async () => {
    const p = await prisma.person.create({
      data: { id: 'p2', name: 'Bob', role: '', status: 'absent' },
    })
    expect(p.role).toBe('')
  })

  it('stores the raw title verbatim, including parens/slashes', async () => {
    const p = await prisma.person.create({
      data: { id: 'p3', name: 'Cara', role: '学生（联培）', status: 'present' },
    })
    expect(p.role).toBe('学生（联培）')
  })
})
