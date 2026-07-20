import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toResource, fromResource } from '@/lib/db/serialize'
import { requireUserOrScope, requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import type { Resource, ApiResponse, PaginatedResponse } from '@/lib/types'

export async function GET(request: Request) {
  const session = await requireUserOrScope(request, 'resource:read')
  if (session instanceof NextResponse) return session

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const category = searchParams.get('category')
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const isAdmin = session.role === 'admin'

  const where: { categoryId?: string; status?: string; accessLevel?: { not: string }; OR?: Array<Record<string, unknown>> } = {}
  if (category) where.categoryId = category
  if (status) where.status = status
  // Non-admins cannot see admin-only resources. public/member are visible to
  // any authenticated user (the dashboard requires login).
  if (!isAdmin) where.accessLevel = { not: 'admin' }
  if (search) {
    const q = { contains: search }
    where.OR = [{ name: q }, { description: q }]
  }

  const rows = (await prisma.resource.findMany({ where })).map(toResource)

  const total = rows.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const items = rows.slice(start, start + pageSize)

  const response: ApiResponse<PaginatedResponse<Resource>> = {
    success: true,
    data: { items, total, page, pageSize, totalPages },
  }
  return NextResponse.json(response)
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  let body: Partial<Resource>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body?.name || !body?.description || !body?.status || !body?.accessLevel) {
    return NextResponse.json({ error: 'name, description, status, accessLevel required' }, { status: 400 })
  }

  const id = `r-${Date.now()}`
  const created = await prisma.resource.create({
    data: fromResource({ ...(body as Resource), id }),
  })
  void logAction({
    ...actorFromAuth(auth),
    action: 'resource.create', targetType: 'resource', targetId: id,
    summary: `新建资源 ${body.name}`,
  })
  return NextResponse.json(toResource(created), { status: 201 })
}
