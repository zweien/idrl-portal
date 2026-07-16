/**
 * PersonId-persistence rule for floor-layout saves.
 *
 * Distinguishes an explicit unassign (payload personId === null, from the
 * assignment UI's "未分配") from a stale-snapshot omission (personId ===
 * undefined, e.g. an editor that didn't carry the field). An explicit null
 * always clears; an undefined at unchanged geometry keeps the DB assignment.
 * Used by PUT /api/floor-layout.
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
 * Three distinct payload signals:
 * - a string id → assign to that person
 * - `null` → EXPLICIT unassign: clear the assignment (a user picked
 *   "未分配"). Honored even when geometry is unchanged.
 * - `undefined` (omitted) → stale-snapshot edit: keep the DB personId when
 *   the geometry is unchanged so a geometry-only save from a stale snapshot
 *   can't wipe an assignment.
 *
 * Otherwise (omitted + geometry changed, or no DB row) the empty value wins.
 */
export function resolvePersonId(
  payload: PayloadWorkstation,
  db: DbWorkstation | undefined,
): string | null {
  if (payload.personId) {
    return payload.personId
  }
  // explicit unassign — always clear
  if (payload.personId === null) {
    return null
  }
  // omitted (undefined) — protect an existing assignment at the same geometry
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
  return null
}
