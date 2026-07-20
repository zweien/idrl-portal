import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toFloor, fromZone, fromWorkstation } from '@/lib/db/serialize'
import { resolvePersonId, findDuplicateIds } from '@/lib/floor-layout'
import { requireUser, requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import type { Zone, NewWorkstation } from '@/lib/types'

interface FloorLayoutBody {
  floors: Array<{
    id: string
    name: string
    order: number
    zones: Array<{
      id: string
      name: string
      floorId: string
      color: string
      order: number
      mode: Zone['mode']
      rows: number
      cols: number
      maxRows: number
      maxCols: number
      workstations: NewWorkstation[]
    }>
  }>
}

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const floors = await prisma.floor.findMany({
    orderBy: { order: 'asc' },
    include: {
      zones: {
        orderBy: { order: 'asc' },
        include: { workstations: true },
      },
    },
  })
  return NextResponse.json({ floors: floors.map(toFloor) })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  let body: FloorLayoutBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body?.floors || !Array.isArray(body.floors)) {
    return NextResponse.json({ error: 'floors required' }, { status: 400 })
  }

  // Reject duplicate ids at each level before diffing — the editor's nextId
  // resets per page load, so a saved floor-100 + a newly added floor can
  // collide. Upsert-in-a-loop would silently collapse duplicates (the old
  // delete/create flow failed loudly on the PK); fail loud here instead.
  const dupErr = findDuplicateIds(body.floors)
  if (dupErr) {
    return NextResponse.json({ error: dupErr }, { status: 400 })
  }

  try {
    // Diff/upsert by id, inside one transaction. The payload is authoritative
    // for structure (add/update/delete floors, zones, workstations), BUT we
    // protect Workstation.personId: a geometry-only edit arriving from a stale
    // snapshot must not null out an assignment. For each payload workstation
    // with an empty personId, if the DB row exists at the same geometry and
    // has a personId, we keep the DB personId.
    const existingWorkstations = await prisma.workstation.findMany()
    const dbWsById = new Map(existingWorkstations.map(w => [w.id, w]))

    // ---- One-person-one-workstation pre-check ----
    // Compute the final personId each workstation will have after this save,
    // then reject if any person ends up on >1 workstation. The DB unique index
    // is the last line of defense, but a clear 400 here is friendlier than a
    // raw constraint violation mid-transaction. Workstations NOT in the payload
    // are deleted below, so only payload workstations + their resolved
    // personIds are relevant.
    const payloadWs = body.floors.flatMap(f => f.zones.flatMap(z => z.workstations))
    const personToWs = new Map<string, string[]>()
    for (const w of payloadWs) {
      const dbRow = dbWsById.get(w.id)
      const pid = resolvePersonId(
        { id: w.id, personId: w.personId, row: w.row, col: w.col, zoneId: w.zoneId, floorId: w.floorId },
        dbRow ? { id: dbRow.id, personId: dbRow.personId, row: dbRow.row, col: dbRow.col, zoneId: dbRow.zoneId, floorId: dbRow.floorId } : undefined,
      )
      if (!pid) continue
      const arr = personToWs.get(pid) ?? []
      arr.push(w.id)
      personToWs.set(pid, arr)
    }
    const conflicts = [...personToWs.entries()].filter(([, wsIds]) => wsIds.length > 1)
    if (conflicts.length > 0) {
      return NextResponse.json(
        {
          error: '一人一工位：以下人员同时分配到多个工位',
          conflicts: conflicts.map(([pid, wsIds]) => ({ personId: pid, workstationIds: wsIds })),
        },
        { status: 400 },
      )
    }

    await prisma.$transaction(async (tx) => {
      // ---- FLOORS: upsert + delete missing ----
      const payloadFloorIds = new Set(body.floors.map(f => f.id))
      const dbFloors = await tx.floor.findMany()
      for (const f of dbFloors) {
        if (!payloadFloorIds.has(f.id)) await tx.floor.delete({ where: { id: f.id } })
      }
      for (const f of body.floors) {
        await tx.floor.upsert({
          where: { id: f.id },
          update: { name: f.name, order: f.order },
          create: { id: f.id, name: f.name, order: f.order },
        })
      }

      // ---- ZONES: upsert + delete missing ----
      const payloadZones = body.floors.flatMap(f => f.zones)
      const payloadZoneIds = new Set(payloadZones.map(z => z.id))
      const dbZones = await tx.zone.findMany()
      for (const z of dbZones) {
        if (!payloadZoneIds.has(z.id)) await tx.zone.delete({ where: { id: z.id } })
      }
      for (const z of payloadZones) {
        const data = fromZone(z)
        await tx.zone.upsert({
          where: { id: z.id },
          update: {
            name: data.name, floorId: data.floorId, color: data.color,
            order: data.order, mode: data.mode,
            rows: data.rows, cols: data.cols, maxRows: data.maxRows, maxCols: data.maxCols,
          },
          create: data,
        })
      }

      // ---- WORKSTATIONS: upsert + delete missing + personId protection ----
      const payloadWsIds = new Set(payloadWs.map(w => w.id))
      const dbWsIds = await tx.workstation.findMany({ select: { id: true } })
      for (const { id } of dbWsIds) {
        if (!payloadWsIds.has(id)) await tx.workstation.delete({ where: { id } })
      }
      // Resolve the final personId for each payload workstation up front. The
      // personId-protection rule (geometry-only edit from a stale snapshot
      // keeps the DB personId) is applied here so the unique constraint sees a
      // consistent final state across all rows.
      const resolved = payloadWs.map(w => {
        const dbRow = dbWsById.get(w.id)
        const personId = resolvePersonId(
          { id: w.id, personId: w.personId, row: w.row, col: w.col, zoneId: w.zoneId, floorId: w.floorId },
          dbRow ? { id: dbRow.id, personId: dbRow.personId, row: dbRow.row, col: dbRow.col, zoneId: dbRow.zoneId, floorId: dbRow.floorId } : undefined,
        )
        return { w, dbRow, personId }
      })
      // Two-phase write to honor the @@unique([personId]) constraint even when
      // a person moves between workstations (e.g. swapping assignments, or
      // moving P from w1 to w2). If we upserted in payload order and the
      // destination ran before the source was cleared, the unique index would
      // reject the destination mid-transaction. Phase 1 clears/structure-writes
      // every workstation with personId=null; phase 2 applies the resolved
      // assignments. A workstation whose final personId is null only runs once.
      // Phase 1: structure + null out personId on every payload workstation.
      for (const { w } of resolved) {
        const data = fromWorkstation(w)
        data.personId = null
        await tx.workstation.upsert({
          where: { id: w.id },
          update: { ...data, personId: null },
          create: { ...data, personId: null },
        })
      }
      // Phase 2: apply the resolved assignments (only where non-null).
      for (const { w, personId } of resolved) {
        if (!personId) continue
        await tx.workstation.update({ where: { id: w.id }, data: { personId } })
      }
    })

    const wsCount = payloadWs.length
    const floorCount = body.floors.length
    await logAction({
      ...actorFromAuth(auth),
      action: 'floor-layout.update', targetType: 'floor-layout',
      summary: `更新工位布局（${floorCount} 楼层，${wsCount} 工位）`,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
