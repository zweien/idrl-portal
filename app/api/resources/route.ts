import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toResource } from '@/lib/db/serialize'
import { requireUser, requireAdmin } from '@/lib/auth-api'
import type { Resource, ApiResponse, PaginatedResponse } from '@/lib/types'

export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  const where: { type?: string; status?: string; OR?: Array<Record<string, unknown>> } = {}
  if (type) where.type = type
  if (status) where.status = status
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

export async function POST() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  return NextResponse.json(
    { success: false, error: 'POST /api/resources disabled. Use PUT /api/admin-data.' },
    { status: 405 },
  )
}
