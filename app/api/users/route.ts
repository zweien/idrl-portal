import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import type { User, ApiResponse } from '@/lib/types'

/**
 * GET /api/users — list all login accounts (for the admin user-management tab).
 * Includes the linked Person's name for display. Never returns secrets (there
 * are none on User — keyHash lives on ApiKey).
 */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const rows = await prisma.user.findMany({
    include: { person: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  const items: (User & { personName?: string | null })[] = rows.map(r => ({
    id: r.id,
    provider: r.provider as User['provider'],
    externalId: r.externalId,
    role: r.role as User['role'],
    personId: r.personId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    disabledAt: r.disabledAt?.toISOString() ?? null,
    personName: r.person?.name ?? null,
  }))
  const response: ApiResponse<(User & { personName?: string | null })[]> = {
    success: true,
    data: items,
  }
  return NextResponse.json(response)
}
