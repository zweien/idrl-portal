import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

// TripInstanceCache: the SQLite mirror of the in-memory approval cache must
// round-trip (persist → fresh map load) so a pm2 restart skips the ~84 detail
// re-fetches per attendance sync.

const tmpDir = mkdtempSync(join(tmpdir(), 'idrl-tripcache-'))
const tmpDbPath = join(tmpDir, 'db.sqlite')
{
  const seed = new Database(tmpDbPath)
  seed.exec(`
    CREATE TABLE TripInstanceCache (
      instanceId       TEXT NOT NULL PRIMARY KEY,
      originatorUserid TEXT,
      tripStart        INTEGER,
      tripEnd          INTEGER,
      reason           TEXT,
      parsed           BOOLEAN NOT NULL,
      fetchedAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  seed.close()
}
process.env.DATABASE_URL = `file:${tmpDbPath}`

vi.mock('@/lib/db', () => {
  const Database = require('better-sqlite3')
  const db = new Database(tmpDbPath)
  // Minimal Prisma-shaped adapter over the temp DB (only what trip-cache uses).
  const rowToEntry = (r: Record<string, unknown> | undefined) => {
    if (!r) return undefined
    return {
      instanceId: r.instanceId as string,
      originatorUserid: (r.originatorUserid as string | null) ?? null,
      tripStart: (r.tripStart as number | null) ?? null,
      tripEnd: (r.tripEnd as number | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      parsed: Boolean(r.parsed),
    }
  }
  return {
    prisma: {
      tripInstanceCache: {
        findMany: async () => db.prepare('SELECT * FROM TripInstanceCache').all().map(rowToEntry),
        upsert: async ({ where, update, create }: {
          where: { instanceId: string }
          update: Record<string, unknown>
          create: Record<string, unknown>
        }) => {
          const exists = db.prepare('SELECT 1 FROM TripInstanceCache WHERE instanceId = ?').get(where.instanceId)
          const row = exists ? update : create
          db.prepare(`
            INSERT INTO TripInstanceCache (instanceId, originatorUserid, tripStart, tripEnd, reason, parsed)
            VALUES (@instanceId, @originatorUserid, @tripStart, @tripEnd, @reason, @parsed)
            ON CONFLICT(instanceId) DO UPDATE SET
              originatorUserid=@originatorUserid, tripStart=@tripStart,
              tripEnd=@tripEnd, reason=@reason, parsed=@parsed
          `).run({
            instanceId: where.instanceId,
            originatorUserid: row.originatorUserid ?? null,
            tripStart: row.tripStart ?? null,
            tripEnd: row.tripEnd ?? null,
            reason: row.reason ?? null,
            parsed: row.parsed ? 1 : 0,
          })
        },
      },
    },
  }
})

const { loadTripCache, persistTripInstance } = await import('@/lib/trip-cache')
type CachedTrip = NonNullable<Parameters<typeof loadTripCache>[0]> extends Map<string, infer E> ? E : never

beforeAll(async () => {
  persistTripInstance('inst-1', { tripStart: 1000, tripEnd: 2000, reason: '出差', parsed: true, originator: 'u1' })
  persistTripInstance('inst-2', { tripStart: 0, tripEnd: 0, parsed: false })
  // Fire-and-forget upserts — give the microtask queue a beat.
  await new Promise(r => setTimeout(r, 20))
})

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }))

describe('trip-cache (persistent approval-instance cache)', () => {
  it('loads persisted instances into a fresh memory map (restart simulation)', async () => {
    const mem = new Map<string, CachedTrip>()
    await loadTripCache(mem)
    expect(mem.get('inst-1')).toMatchObject({
      tripStart: 1000, tripEnd: 2000, reason: '出差', parsed: true, originator: 'u1',
    })
    // The not-a-trip sentinel round-trips so the detail fetch stays skipped.
    expect(mem.get('inst-2')).toMatchObject({ tripStart: 0, tripEnd: 0, parsed: false })
  })

  it('does not overwrite live entries already in the map', async () => {
    const mem = new Map<string, CachedTrip>([
      ['inst-1', { tripStart: 9999, tripEnd: 9999, parsed: true, originator: 'live' }],
    ])
    await loadTripCache(mem)
    expect(mem.get('inst-1')?.originator).toBe('live')
  })

  it('persists an update for an existing instance id (upsert path)', async () => {
    persistTripInstance('inst-1', { tripStart: 1000, tripEnd: 2000, reason: '出差改签', parsed: true, originator: 'u1' })
    await new Promise(r => setTimeout(r, 20))
    // loadTripCache is once-per-process by design — read the table directly.
    const db = new Database(tmpDbPath, { readonly: true })
    const row = db.prepare('SELECT reason FROM TripInstanceCache WHERE instanceId = ?').get('inst-1') as { reason: string }
    db.close()
    expect(row.reason).toBe('出差改签')
  })
})
