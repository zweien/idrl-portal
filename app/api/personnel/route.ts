import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toPerson } from '@/lib/db/serialize'
import type { Person, ApiResponse, PaginatedResponse } from '@/lib/types'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  // Build Prisma where
  const where: { OR?: Array<Record<string, unknown>>; status?: string } = {}
  if (status) where.status = status
  if (search) {
    const q = { contains: search }
    where.OR = [
      { name: q },
      { email: q },
      // researchAreas is a JSON-encoded string column; SQLite can't introspect it.
      // Filter in memory after fetching.
    ]
  }

  // Fetch all matching rows (researchAreas filter still in-memory)
  const allRows = await prisma.person.findMany({ where })
  let filtered = allRows.map(toPerson)

  if (search) {
    const query = search.toLowerCase()
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.email?.toLowerCase().includes(query) ||
      p.researchAreas?.some(area => area.toLowerCase().includes(query)),
    )
  }

  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const items = filtered.slice(start, start + pageSize)

  const response: ApiResponse<PaginatedResponse<Person>> = {
    success: true,
    data: { items, total, page, pageSize, totalPages },
  }
  return NextResponse.json(response)
}

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'POST /api/personnel disabled. Use PUT /api/admin-data.' },
    { status: 405 },
  )
}
