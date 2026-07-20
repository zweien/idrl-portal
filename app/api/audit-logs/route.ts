import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import type { AuditLog, ApiResponse, PaginatedResponse } from '@/lib/types'

/**
 * GET /api/audit-logs — paginated, filterable audit log for admin write ops.
 * Params: page, pageSize, actorId, action, targetType, targetId.
 * Joins actor name (User.name for users, ApiKey.name for api keys).
 */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50'), 200)
  const actorId = searchParams.get('actorId')
  const action = searchParams.get('action')
  const targetType = searchParams.get('targetType')
  const targetId = searchParams.get('targetId')

  const where: Record<string, unknown> = {}
  if (actorId) where.actorId = actorId
  if (action) where.action = action
  if (targetType) where.targetType = targetType
  if (targetId) where.targetId = targetId

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  // Resolve actor names: collect user-ids and apikey-ids, batch-query.
  // NOTE: the User model has no `name` column — human names live on the related
  // Person (via personId). So for user actors we select the `person` relation
  // and use Person.name. ApiKey has its own `name`.
  const userIds = [...new Set(rows.filter(r => r.actorType === 'user').map(r => r.actorId))]
  const apiKeyIds = [...new Set(rows.filter(r => r.actorType === 'apikey').map(r => r.actorId))]
  const [users, apiKeys] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, person: { select: { name: true } } },
        })
      : [],
    apiKeyIds.length ? prisma.apiKey.findMany({ where: { id: { in: apiKeyIds } }, select: { id: true, name: true } }) : [],
  ])
  const nameMap = new Map<string, string>()
  for (const u of users) {
    if (u.person?.name) nameMap.set(u.id, u.person.name)
  }
  for (const k of apiKeys) nameMap.set(k.id, k.name)

  const items: (AuditLog & { actorName?: string })[] = rows.map(r => ({
    id: r.id,
    actorId: r.actorId,
    actorType: r.actorType as AuditLog['actorType'],
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId ?? null,
    summary: r.summary,
    status: r.status as AuditLog['status'],
    createdAt: r.createdAt.toISOString(),
    actorName: nameMap.get(r.actorId),
  }))

  const totalPages = Math.ceil(total / pageSize) || 1
  const response: ApiResponse<PaginatedResponse<AuditLog & { actorName?: string }>> = {
    success: true,
    data: { items, total, page, pageSize, totalPages },
  }
  return NextResponse.json(response)
}
