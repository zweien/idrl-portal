import { assertSameOrigin } from '@/lib/csrf'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toPerson, fromPerson } from '@/lib/db/serialize'
import { requireUserOrScopeAny, requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import { parsePagination, paginate, totalPages as computeTotalPages } from '@/lib/pagination'
import type { Person, ApiResponse, PaginatedResponse } from '@/lib/types'

export async function GET(request: Request) {
  const auth = await requireUserOrScopeAny(request, ['admin'])
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const { page, pageSize } = parsePagination(searchParams)
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
  // Attach login-disabled state (offboarded people keep their row visible
  // with a badge and can be reinstated; derived live, never persisted on
  // Person itself).
  const personIds = allRows.map(p => p.id)
  const disabledUsers = personIds.length
    ? await prisma.user.findMany({ where: { personId: { in: personIds }, disabledAt: { not: null } }, select: { personId: true } })
    : []
  const disabledSet = new Set(disabledUsers.map(u => u.personId))
  let filtered = allRows.map(p => ({
    ...toPerson(p),
    loginDisabled: disabledSet.has(p.id),
    offboarded: p.offboardedAt !== null,
  }))

  if (search) {
    const query = search.toLowerCase()
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.email?.toLowerCase().includes(query) ||
      p.researchAreas?.some(area => area.toLowerCase().includes(query)),
    )
  }

  const total = filtered.length
  const tp = computeTotalPages(total, pageSize)
  const items = paginate(filtered, { page, pageSize })

  const response: ApiResponse<PaginatedResponse<Person>> = {
    success: true,
    data: { items, total, page, pageSize, totalPages: tp },
  }
  return NextResponse.json(response)
}

export async function POST(req: NextRequest) {
  const __csrf = assertSameOrigin(req)
  if (__csrf) return __csrf
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
