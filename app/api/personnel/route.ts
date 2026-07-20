import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toPerson, fromPerson } from '@/lib/db/serialize'
import { requireUser, requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import type { Person, ApiResponse, PaginatedResponse } from '@/lib/types'

export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

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

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  let body: Partial<Person>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  // role is now free-text and may be blank (a person with no title yet);
  // require it to be present (a string) but allow ''. name + status required.
  if (!body?.name || !body?.status || typeof body?.role !== 'string') {
    return NextResponse.json({ error: 'name, role (string), status required' }, { status: 400 })
  }

  const id = `p-${Date.now()}`
  const created = await prisma.person.create({
    data: fromPerson({ ...(body as Person), id }),
  })
  void logAction({
    ...actorFromAuth(auth),
    action: 'person.create', targetType: 'person', targetId: id,
    summary: `新建人员 ${body.name}`,
  })
  return NextResponse.json(toPerson(created), { status: 201 })
}
