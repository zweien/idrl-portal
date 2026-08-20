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
 * Build a collision-aware id generator seeded from the CURRENT layout state.
 *
 * The old module-level counter (`nextId = 100`) reset on every page load, so
 * the first generated id of a session (e.g. `zone-100`) could collide with an
 * editor-created id saved by an EARLIER session, and the save was rejected by
 * findDuplicateIds. Scanning all existing ids (floors, zones, workstations)
 * up front and skipping them fixes that; ids returned by one generator are
 * also unique among themselves (updateZoneGrid generates several in a loop).
 */
export function makeIdGen(
  floors: Array<{ id: string; zones: Array<{ id: string; workstations: Array<{ id: string }> }> }>,
): (prefix: string) => string {
  const used = new Set<string>()
  for (const f of floors) {
    used.add(f.id)
    for (const z of f.zones) {
      used.add(z.id)
      for (const w of z.workstations) used.add(w.id)
    }
  }
  return (prefix: string) => {
    let n = 100
    while (used.has(`${prefix}-${n}`)) n++
    const id = `${prefix}-${n}`
    used.add(id)
    return id
  }
}

/**
 * Detect duplicate ids at each level of a floor-layout payload.
 * Returns an error message describing the first collision, or null if none.
 * (Defense in depth: the editor's makeIdGen avoids collisions with saved
 * ids, but a stale multi-tab editor could still send them — the upsert loop
 * would silently collapse duplicates, so fail loud here instead.)
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
