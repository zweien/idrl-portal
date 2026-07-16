import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toFloor, fromZone, fromWorkstation } from '@/lib/db/serialize'
import { resolvePersonId } from '@/lib/floor-layout'
import { requireUser, requireAdmin } from '@/lib/auth-api'
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

  try {
    // Diff/upsert by id, inside one transaction. The payload is authoritative
    // for structure (add/update/delete floors, zones, workstations), BUT we
    // protect Workstation.personId: a geometry-only edit arriving from a stale
    // snapshot must not null out an assignment. For each payload workstation
    // with an empty personId, if the DB row exists at the same geometry and
    // has a personId, we keep the DB personId.
    const existingWorkstations = await prisma.workstation.findMany()
    const dbWsById = new Map(existingWorkstations.map(w => [w.id, w]))

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
      const payloadWs = body.floors.flatMap(f => f.zones.flatMap(z => z.workstations))
      const payloadWsIds = new Set(payloadWs.map(w => w.id))
      const dbWsIds = await tx.workstation.findMany({ select: { id: true } })
      for (const { id } of dbWsIds) {
        if (!payloadWsIds.has(id)) await tx.workstation.delete({ where: { id } })
      }
      for (const w of payloadWs) {
        const data = fromWorkstation(w)
        const dbRow = dbWsById.get(w.id)
        // personId protection: geometry-only edit from a stale snapshot must
        // not null an assignment. resolvePersonId keeps the DB personId when
        // the payload omits it AND the geometry is unchanged.
        data.personId = resolvePersonId(
          { id: w.id, personId: w.personId, row: w.row, col: w.col, zoneId: w.zoneId, floorId: w.floorId },
          dbRow ? { id: dbRow.id, personId: dbRow.personId, row: dbRow.row, col: dbRow.col, zoneId: dbRow.zoneId, floorId: dbRow.floorId } : undefined,
        )
        await tx.workstation.upsert({
          where: { id: w.id },
          update: data,
          create: data,
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
