import { prisma } from '@/lib/db'

/**
 * SQLite-backed mirror of the in-memory DingTalk approval-instance cache.
 *
 * The in-memory map in lib/dingtalk-admin.ts is the hot path; this module
 * persists it so a process restart (pm2 reload, deploy) doesn't cold-miss
 * every cached instance and re-fetch ~84 detail calls per sync. Entries are
 * written only for terminal instances (COMPLETED+agree, or the terminal
 * not-a-trip sentinel) — their content never changes, so upserts are
 * immutable and there is no TTL. Load-once populates the memory map lazily
 * on the first trip sync after boot; row counts are small (hundreds/year).
 */

export interface CachedTrip {
  tripStart: number
  tripEnd: number
  reason?: string
  /** false = terminal but unparseable — safe to skip forever. */
  parsed: boolean
  originator?: string
}

let loaded = false

/** Load every cached instance into `mem` exactly once per process. */
export async function loadTripCache(mem: Map<string, CachedTrip>): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const rows = await prisma.tripInstanceCache.findMany()
    for (const r of rows) {
      // Don't overwrite entries already fetched live this process — they
      // are at least as fresh as the persisted row.
      if (mem.has(r.instanceId)) continue
      mem.set(r.instanceId, {
        // BigInt column -> JS epoch-ms numbers at the cache boundary.
        tripStart: r.tripStart === null ? 0 : Number(r.tripStart),
        tripEnd: r.tripEnd === null ? 0 : Number(r.tripEnd),
        reason: r.reason ?? undefined,
        parsed: r.parsed,
        originator: r.originatorUserid ?? undefined,
      })
    }
  } catch (e) {
    // Cache load failure must not break the sync — the memory map simply
    // starts cold and rows get (re-)persisted as they are fetched.
    console.error('trip cache load failed (continuing cold):', e)
  }
}

/** Fire-and-forget upsert of one terminal instance's parsed result. */
export function persistTripInstance(instanceId: string, entry: CachedTrip): void {
  // Number -> BigInt at the boundary (epoch ms exceed Prisma's 32-bit Int).
  const start = entry.tripStart ? BigInt(entry.tripStart) : null
  const end = entry.tripEnd ? BigInt(entry.tripEnd) : null
  const data = {
    originatorUserid: entry.originator ?? null,
    tripStart: start,
    tripEnd: end,
    reason: entry.reason ?? null,
    parsed: entry.parsed,
  }
  void prisma.tripInstanceCache
    .upsert({
      where: { instanceId },
      update: data,
      create: { instanceId, ...data },
    })
    .catch(e => console.error(`trip cache persist failed for ${instanceId}:`, e))
}
