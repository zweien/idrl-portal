import { assertSameOrigin } from '@/lib/csrf'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireScope } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import { planAssignment } from '@/lib/workstation-assign'
import { toSafeError } from '@/lib/safe-error'

/**
 * PUT /api/workstations/assignment
 *
 * Assign a person to a workstation, clear a workstation, or move a person —
 * the machine-facing alternative to the visual floor-layout editor.
 *
 * Auth: admin session OR an API key with the `admin` scope.
 * Body: { workstationId: string, personId: string | null, force?: boolean }
 *   - personId=null           → clear the workstation
 *   - personId=X              → assign X; X's previous workstation is freed
 *                               automatically (a person MOVES)
 *   - target occupied by Y    → 409 with the occupant unless force=true,
 *                               which displaces Y (their seat is cleared)
 * One-person-one-workstation is enforced in the transaction and by the DB
 * unique constraint. Audited as workstation.assign.
 */
export async function PUT(req: NextRequest) {
  const __csrf = assertSameOrigin(req)
  if (__csrf) return __csrf
  const auth = await requireScope(req, 'admin')
  if (auth instanceof NextResponse) return auth

  let parsed: unknown
  try {
    parsed = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  // Valid JSON that is not an object (null, "x", arrays) would throw on the
  // destructuring / `in` check below — outside any try — landing as a 500.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'body must be a JSON object' }, { status: 400 })
  }
  const body = parsed as { workstationId?: string; personId?: string | null; force?: boolean }
  const { workstationId, force } = body
  // personId may be null (clear) — but must be present as a key.
  if (!workstationId || typeof workstationId !== 'string' || !('personId' in body)) {
    return NextResponse.json({ error: 'workstationId and personId (string|null) required' }, { status: 400 })
  }
  const personId: string | null = body.personId ?? null
  if (personId !== null && typeof personId !== 'string') {
    return NextResponse.json({ error: 'personId must be a string or null' }, { status: 400 })
  }
  // force triggers a destructive displacement — a truthy "false" string must
  // not silently enable it (documented 409 semantics).
  if (force !== undefined && typeof force !== 'boolean') {
    return NextResponse.json({ error: 'force must be a boolean' }, { status: 400 })
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const workstation = await tx.workstation.findUnique({
        where: { id: workstationId },
        select: { id: true, name: true, personId: true },
      })
      const person = personId
        ? await tx.person.findUnique({ where: { id: personId }, select: { id: true, name: true } })
        : undefined
      // Person rows expose workstations relation, not a workstationId column —
      // resolve their current seat explicitly.
      let currentSeat: { id: string; name: string } | undefined
      if (person) {
        const seat = await tx.workstation.findFirst({ where: { personId }, select: { id: true, name: true } })
        if (seat) currentSeat = seat
      }

      const plan = planAssignment(
        workstation ?? undefined,
        person ? { id: person.id, name: person.name, ...(currentSeat ? { workstationId: currentSeat.id } : {}) } : undefined,
        personId,
        { force },
      )
      if (!plan.ok) return plan

      for (const clearId of plan.clear) {
        await tx.workstation.update({ where: { id: clearId }, data: { personId: null } })
      }
      if (personId) {
        await tx.workstation.update({ where: { id: plan.assign.workstationId }, data: { personId } })
      }
      return plan
    })

    if (!outcome.ok) {
      const status = outcome.reason === 'conflict' ? 409 : 404
      return NextResponse.json(
        {
          error: outcome.message,
          reason: outcome.reason,
          ...(outcome.conflictPersonId
            ? { conflict: { personId: outcome.conflictPersonId } }
            : {}),
        },
        { status },
      )
    }

    const ws = await prisma.workstation.findUnique({
      where: { id: outcome.assign.workstationId },
      select: { id: true, name: true, personId: true, person: { select: { name: true } } },
    })
    void logAction({
      ...actorFromAuth(auth),
      action: 'workstation.assign', targetType: 'workstation', targetId: workstationId,
      summary: outcome.summary,
    })
    return NextResponse.json({
      ok: true,
      summary: outcome.summary,
      workstation: {
        id: ws?.id ?? workstationId,
        name: ws?.name ?? '',
        personId: ws?.personId ?? null,
        personName: ws?.person?.name ?? null,
      },
    })
  } catch (e) {
    console.error('workstation assignment failed:', e)
    const { message: msg } = toSafeError(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
