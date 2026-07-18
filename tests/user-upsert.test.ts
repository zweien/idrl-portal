import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * User upsert uniqueness: a SSO callback upserts on (provider, externalId).
 * Repeated logins for the same identity must reuse the row, not create new
 * ones. Uses a throwaway on-disk SQLite DB so the test is hermetic.
 */

let prisma: PrismaClient
let tmpDir: string

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'idrl-upsert-'))
  const db = new Database(join(tmpDir, 'test.db'))
  // Minimal schema for the User/Person tables this test exercises.
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
    CREATE TABLE "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "externalId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "personId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "disabledAt" DATETIME,
      CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX "User_provider_externalId_key" ON "User"("provider", "externalId");
  `)
  prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${join(tmpDir, 'test.db')}` }),
  })
})

afterAll(async () => {
  await prisma?.$disconnect()
  rmSync(tmpDir, { recursive: true, force: true })
})

/** Mirrors the callback's upsert shape. */
async function upsertUser(provider: string, externalId: string, role: 'admin' | 'member', personId?: string) {
  return prisma.user.upsert({
    where: { provider_externalId: { provider, externalId } },
    update: { ...(personId ? { personId } : {}) },
    create: { provider, externalId, role, ...(personId ? { personId } : {}) },
  })
}

describe('User upsert uniqueness (provider + externalId)', () => {
  it('creates the user on first login', async () => {
    const u = await upsertUser('authentik', 'sub-123', 'member')
    expect(u.id).toBeTruthy()
    expect(u.role).toBe('member')
  })

  it('reuses the same row on repeat login (no duplicate)', async () => {
    const first = await upsertUser('dingtalk', 'union-abc', 'member')
    const second = await upsertUser('dingtalk', 'union-abc', 'member')
    expect(second.id).toBe(first.id)
    const count = await prisma.user.count({
      where: { provider: 'dingtalk', externalId: 'union-abc' },
    })
    expect(count).toBe(1)
  })

  it('treats same externalId under different providers as distinct users', async () => {
    await upsertUser('authentik', 'shared-id', 'member')
    await upsertUser('dingtalk', 'shared-id', 'member')
    const count = await prisma.user.count({ where: { externalId: 'shared-id' } })
    expect(count).toBe(2)
  })

  it('does not overwrite role on re-login (update branch omits role)', async () => {
    // Seed an admin, then "log in" again — role must persist.
    await prisma.user.create({
      data: { provider: 'local', externalId: 'adminseed', role: 'admin' },
    })
    const after = await upsertUser('local', 'adminseed', 'member' as never)
    expect(after.role).toBe('admin')
  })
})
