import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * User soft-ban + role self-protection. Uses a throwaway on-disk SQLite with a
 * User table (incl. disabledAt) so the test is hermetic.
 *
 * NOTE: this exercises the DB-level behavior the API/auth layer relies on
 * (disabledAt stored + clearable, role writable). The full requireUser
 * re-fetch + PATCH self-guard live in lib code that imports the @/lib/db
 * singleton; they're covered by the E2E smoke instead.
 */

let prisma: PrismaClient
let tmpDir: string

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'idrl-user-'))
  const db = new Database(join(tmpDir, 'test.db'))
  db.exec(`
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "externalId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "personId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "disabledAt" DATETIME
    );
    CREATE UNIQUE INDEX "User_provider_externalId_key" ON "User"("provider", "externalId");
  `)
  prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${join(tmpDir, 'test.db')}` }),
  })
  await prisma.user.create({ data: { id: 'u1', provider: 'local', externalId: 'alice', role: 'admin' } })
  await prisma.user.create({ data: { id: 'u2', provider: 'local', externalId: 'bob', role: 'member' } })
})

afterAll(async () => {
  await prisma?.$disconnect()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('User soft-ban (disabledAt)', () => {
  it('starts enabled (disabledAt null)', async () => {
    const u = await prisma.user.findUnique({ where: { id: 'u2' } })
    expect(u?.disabledAt).toBeNull()
  })

  it('ban sets disabledAt; unban clears it', async () => {
    await prisma.user.update({ where: { id: 'u2' }, data: { disabledAt: new Date() } })
    expect((await prisma.user.findUnique({ where: { id: 'u2' } }))?.disabledAt).not.toBeNull()
    await prisma.user.update({ where: { id: 'u2' }, data: { disabledAt: null } })
    expect((await prisma.user.findUnique({ where: { id: 'u2' } }))?.disabledAt).toBeNull()
  })
})

describe('User role change', () => {
  it('promotes a member to admin', async () => {
    await prisma.user.update({ where: { id: 'u2' }, data: { role: 'admin' } })
    expect((await prisma.user.findUnique({ where: { id: 'u2' } }))?.role).toBe('admin')
  })
})

describe('User↔Person link', () => {
  it('links and unlinks a personId', async () => {
    await prisma.user.update({ where: { id: 'u1' }, data: { personId: 'p1' } })
    expect((await prisma.user.findUnique({ where: { id: 'u1' } }))?.personId).toBe('p1')
    await prisma.user.update({ where: { id: 'u1' }, data: { personId: null } })
    expect((await prisma.user.findUnique({ where: { id: 'u1' } }))?.personId).toBeNull()
  })
})
