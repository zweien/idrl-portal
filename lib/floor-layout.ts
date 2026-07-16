/**
 * PersonId-protection rule for floor-layout saves.
 *
 * A geometry-only edit arriving from a stale snapshot must not null out an
 * existing Workstation.personId assignment. Used by PUT /api/floor-layout.
 */

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
