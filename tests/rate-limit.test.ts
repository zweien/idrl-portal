import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * DB-backed rate limiter. The ApiKey row carries rlWindowStart + rlCount +
 * rateLimitPerMin; checkRateLimit increments atomically so concurrent calls
 * can't under-count.
 *
 * checkRateLimit imports prisma from @/lib/db, which captures a singleton at
 * module load. We vi.mock @/lib/db to return a getter that resolves to the
 * temp client we create in beforeAll, keeping the test hermetic.
 */

let prisma: PrismaClient
let tmpDir: string

// The mock must be registered before any import of @/lib/rate-limit. It reads
// the temp client from a module-level variable that beforeAll assigns to.
vi.mock('@/lib/db', () => ({
  get prisma() {
    return prisma
  },
}))

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'idrl-rl-'))
  const db = new Database(join(tmpDir, 'test.db'))
  db.exec(`
    CREATE TABLE "ApiKey" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "keyHash" TEXT NOT NULL,
      "prefix" TEXT NOT NULL,
      "scopes" TEXT NOT NULL,
      "lastUsedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "revokedAt" DATETIME,
      "rateLimitPerMin" INTEGER,
      "rlWindowStart" DATETIME,
      "rlCount" INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
  `)
  prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${join(tmpDir, 'test.db')}` }),
  })
  // Seed three keys: default limit, custom limit (3), and one for isolation.
  await prisma.apiKey.create({ data: { id: 'k_def', name: 'def', keyHash: 'h1', prefix: 'p', scopes: '[]' } })
  await prisma.apiKey.create({ data: { id: 'k_3', name: 'three', keyHash: 'h2', prefix: 'p', scopes: '[]', rateLimitPerMin: 3 } })
  await prisma.apiKey.create({ data: { id: 'k_iso', name: 'iso', keyHash: 'h3', prefix: 'p', scopes: '[]', rateLimitPerMin: 2 } })
})

afterAll(async () => {
  await prisma?.$disconnect()
  rmSync(tmpDir, { recursive: true, force: true })
})

const { checkRateLimit, RATE_LIMIT_DEFAULT } = await import('@/lib/rate-limit')

describe('checkRateLimit (DB counters)', () => {
  it('allows up to the default limit, then rejects', async () => {
    for (let i = 0; i < RATE_LIMIT_DEFAULT; i++) {
      const r = await checkRateLimit('k_def', RATE_LIMIT_DEFAULT)
      expect(r.allowed).toBe(true)
      expect(r.retryAfter).toBe(0)
    }
    const over = await checkRateLimit('k_def', RATE_LIMIT_DEFAULT)
    expect(over.allowed).toBe(false)
    expect(over.retryAfter).toBeGreaterThan(0)
    expect(over.retryAfter).toBeLessThanOrEqual(60)
  })

  it('honors a custom per-key limit', async () => {
    // k_3 has rateLimitPerMin = 3.
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit('k_3', 3)
      expect(r.allowed).toBe(true)
    }
    const over = await checkRateLimit('k_3', 3)
    expect(over.allowed).toBe(false)
  })

  it('counts keys independently', async () => {
    await checkRateLimit('k_iso', 2)
    await checkRateLimit('k_iso', 2)
    const isoOver = await checkRateLimit('k_iso', 2)
    expect(isoOver.allowed).toBe(false)
    // k_def's count is unaffected by k_iso usage — confirm via DB read.
    const def = await prisma.apiKey.findUnique({ where: { id: 'k_def' } })
    expect(def?.rlCount).toBe(RATE_LIMIT_DEFAULT)
  })

  it('does not exceed the limit under rapid sequential calls (no under-count)', async () => {
    await prisma.apiKey.create({ data: { id: 'k_race', name: 'race', keyHash: 'h4', prefix: 'p', scopes: '[]', rateLimitPerMin: 5 } })
    let allowed = 0
    for (let i = 0; i < 10; i++) {
      if ((await checkRateLimit('k_race', 5)).allowed) allowed++
    }
    expect(allowed).toBe(5) // exactly the limit, never more
  })
})
