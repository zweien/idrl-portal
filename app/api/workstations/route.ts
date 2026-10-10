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
 *   ?occupied=1     → only occupied workstones (e.g. roster for attendance
 *                     follow-ups)
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserOrScopeAny(req, ['admin'])
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const personId = searchParams.get('personId')
  const floorId = searchParams.get('floorId')
  const freeOnly = searchParams.get('free') === '1'
  const occupiedOnly = searchParams.get('occupied') === '1'
  // personId pins the query to one row; free/occupied assert its emptiness —
  // combining personId with either is contradictory, so reject instead of
  // silently broadening the result set.
  if (personId && (freeOnly || occupiedOnly)) {
    return NextResponse.json(
      { error: 'personId cannot be combined with free/occupied' },
      { status: 400 },
    )
  }
  if (freeOnly && occupiedOnly) {
    return NextResponse.json({ error: 'free and occupied are mutually exclusive' }, { status: 400 })
  }

  const workstations = await prisma.workstation.findMany({
    where: {
      ...(personId ? { personId } : {}),
      ...(floorId ? { floorId } : {}),
      ...(freeOnly ? { personId: null } : {}),
      ...(occupiedOnly ? { personId: { not: null } } : {}),
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
