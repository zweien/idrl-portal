/**
 * PersonId-protection rule for floor-layout saves.
 *
 * A geometry-only edit arriving from a stale snapshot must not null out an
 * existing Workstation.personId assignment. Used by PUT /api/floor-layout.
 */

import type { Zone, NewWorkstation } from '@/lib/types'

interface DbWorkstation {
  id: string
  personId: string | null
  row: number
  col: number
  zoneId: string
  floorId: string
}

interface PayloadWorkstation {
  id: string
  personId?: string | null
  row: number
  col: number
  zoneId: string
  floorId: string
}

/**
 * Detect duplicate ids at each level of a floor-layout payload.
 * Returns an error message describing the first collision, or null if none.
 * (The editor's nextId resets per page load, so saved ids can collide with
 * newly added ones; the upsert loop would silently collapse them.)
 */
export function findDuplicateIds(
  floors: Array<{ id: string; zones: Array<{ id: string; workstations: Array<{ id: string }> }> }>,
): string | null {
  const seenFloors = new Set<string>()
  for (const f of floors) {
    if (seenFloors.has(f.id)) return `duplicate floor id: ${f.id}`
    seenFloors.add(f.id)
  }
  const seenZones = new Set<string>()
  for (const f of floors) for (const z of f.zones) {
    if (seenZones.has(z.id)) return `duplicate zone id: ${z.id}`
    seenZones.add(z.id)
  }
  const seenWs = new Set<string>()
  for (const f of floors) for (const z of f.zones) for (const w of z.workstations) {
    if (seenWs.has(w.id)) return `duplicate workstation id: ${w.id}`
    seenWs.add(w.id)
  }
  return null
}

/**
 * Decide the personId to persist for a payload workstation.
 *
 * - If the payload carries an explicit personId, it wins (assignment or
 *   explicit unassign are honored).
 * - If the payload omits/empties personId but a DB row exists at the SAME
 *   geometry (row/col/zone/floor), keep the DB personId — the save is a
 *   geometry-only edit and must not wipe an assignment from a stale snapshot.
 * - Otherwise (payload empty, geometry changed, or no DB row) the empty
 *   value wins.
 */
export function resolvePersonId(
  payload: PayloadWorkstation,
  db: DbWorkstation | undefined,
): string | null {
  if (payload.personId !== undefined && payload.personId !== null) {
    return payload.personId
  }
  if (
    db &&
    db.personId &&
    db.row === payload.row &&
    db.col === payload.col &&
    db.zoneId === payload.zoneId &&
    db.floorId === payload.floorId
  ) {
    return db.personId
  }
  return payload.personId ?? null
}
