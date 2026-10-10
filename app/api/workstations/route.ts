import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUserOrScopeAny } from '@/lib/auth-api'

/**
 * GET /api/workstations
 *
 * Workstation listing with floor/zone/occupant names resolved — the
 * machine-readable counterpart of the floor-plan UI.
 *
 * Auth: admin session OR an API key with the `admin` scope.
 * Query:
 *   ?personId=dt-…  → that person's workstation (0 or 1 rows)
 *   ?floorId=floor-…→ only workstations on that floor
 *   ?free=1         → only unoccupied workstations
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserOrScopeAny(req, ['admin'])
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const personId = searchParams.get('personId')
  const floorId = searchParams.get('floorId')
  const freeOnly = searchParams.get('free') === '1'

  const workstations = await prisma.workstation.findMany({
    where: {
      ...(personId ? { personId } : {}),
      ...(floorId ? { floorId } : {}),
      ...(freeOnly ? { personId: null } : {}),
    },
    include: {
      zone: { select: { name: true } },
      floor: { select: { name: true } },
      person: { select: { name: true } },
    },
    orderBy: [{ floorId: 'asc' }, { zoneId: 'asc' }, { row: 'asc' }, { col: 'asc' }],
  })

  return NextResponse.json({
    workstations: workstations.map(w => ({
      id: w.id,
      name: w.name,
      floorId: w.floorId,
      floorName: w.floor.name,
      zoneId: w.zoneId,
      zoneName: w.zone.name,
      row: w.row,
      col: w.col,
      status: w.status,
      personId: w.personId,
      personName: w.person?.name ?? null,
    })),
  })
}
