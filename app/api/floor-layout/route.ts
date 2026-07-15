import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toFloor, fromZone, fromWorkstation } from '@/lib/db/serialize'
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
    // Atomic replace: delete all then recreate everything in one transaction.
    await prisma.$transaction(async (tx) => {
      await tx.workstation.deleteMany({})
      await tx.zone.deleteMany({})
      await tx.floor.deleteMany({})

      await tx.floor.createMany({
        data: body.floors.map(f => ({ id: f.id, name: f.name, order: f.order })),
      })
      await tx.zone.createMany({
        data: body.floors.flatMap(f => f.zones.map(fromZone)),
      })
      await tx.workstation.createMany({
        data: body.floors.flatMap(f => f.zones.flatMap(z => z.workstations.map(fromWorkstation))),
      })
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
