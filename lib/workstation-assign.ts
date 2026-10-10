/**
 * Pure planning for the workstation-assignment API (PUT /api/workstations/
 * assignment). Computes the DB deltas for a requested (workstation, person)
 * pair against the current layout, enforcing the one-person-one-workstation
 * invariant with explicit, machine-readable outcomes:
 *
 * - personId=null        → clear the workstation (if occupied)
 * - personId=X           → free X's current workstation first (a person
 *                          MOVES — they never sit on two), then assign
 * - target occupied by Y → 409 conflict unless force, in which case Y is
 *                          displaced (left workstation-less, not deleted)
 */

export interface WsRef {
  id: string
  name: string
  personId: string | null
}

export interface WsPerson {
  id: string
  name: string
}

export type AssignmentPlan =
  | {
      ok: true
      /** Workstation ids to set personId=null (X's old seat, a displaced seat). */
      clear: string[]
      assign: { workstationId: string; personId: string }
      /** ids of people displaced by force (informational; their seat was cleared). */
      displacedPersonIds: string[]
      summary: string
    }
  | {
      ok: false
      reason: 'workstation-not-found' | 'person-not-found' | 'conflict'
      message: string
      conflictPersonId?: string
    }

export function planAssignment(
  workstation: WsRef | undefined,
  person: WsPerson | undefined,
  requestedPersonId: string | null,
  opts: { force?: boolean } = {},
): AssignmentPlan {
  if (!workstation) {
    return { ok: false, reason: 'workstation-not-found', message: '工位不存在' }
  }
  if (requestedPersonId !== null && !person) {
    return { ok: false, reason: 'person-not-found', message: '人员不存在' }
  }

  // Clear-only: empty an occupied workstation.
  if (requestedPersonId === null) {
    if (!workstation.personId) {
      return {
        ok: true,
        clear: [],
        assign: { workstationId: workstation.id, personId: '' },
        displacedPersonIds: [],
        summary: `工位 ${workstation.name} 本就无人占用`,
      }
    }
    return {
      ok: true,
      clear: [workstation.id],
      assign: { workstationId: workstation.id, personId: '' },
      displacedPersonIds: [],
      summary: `已清空工位 ${workstation.name}`,
    }
  }

  const personName = person!.name

  // Same seat: no-op assignment (still valid, clears nothing).
  if (workstation.personId === requestedPersonId) {
    return {
      ok: true,
      clear: [],
      assign: { workstationId: workstation.id, personId: requestedPersonId },
      displacedPersonIds: [],
      summary: `${personName} 已在工位 ${workstation.name}`,
    }
  }

  const clear: string[] = []
  const displacedPersonIds: string[] = []
  let summary = `已将 ${personName} 分配到工位 ${workstation.name}`

  // Target occupied by someone else → conflict unless force.
  if (workstation.personId) {
    if (!opts.force) {
      return {
        ok: false,
        reason: 'conflict',
        message: `目标工位 ${workstation.name} 已被占用`,
        conflictPersonId: workstation.personId,
      }
    }
    displacedPersonIds.push(workstation.personId)
    clear.push(workstation.id)
    summary = `已将 ${personName} 分配到工位 ${workstation.name}（原占用者已被顶替）`
  }

  // The person's CURRENT seat is freed — a person moves, never duplicates.
  // Only add it when it's a different seat than the target (same-seat was
  // handled above) and not already in clear.
  const current = (person as WsPerson & { workstationId?: string }).workstationId
  if (current && current !== workstation.id && !clear.includes(current)) {
    clear.push(current)
  }

  return { ok: true, clear, assign: { workstationId: workstation.id, personId: requestedPersonId }, displacedPersonIds, summary }
}
