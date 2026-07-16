import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toPerson, fromPerson } from '@/lib/db/serialize'
import { requireAdmin } from '@/lib/auth-api'
import type { Person } from '@/lib/types'

/** PATCH /api/personnel/:id — update a single person. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  let body: Partial<Person>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const existing = await prisma.person.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const updated = await prisma.person.update({
    where: { id },
    data: fromPerson({ ...(toPerson(existing)), ...(body as Person), id }),
  })
  return NextResponse.json(toPerson(updated))
}

/** DELETE /api/personnel/:id — delete a single person. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  try {
    await prisma.person.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
