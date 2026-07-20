import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toResource, fromResource } from '@/lib/db/serialize'
import { requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import type { Resource } from '@/lib/types'

/** PATCH /api/resources/:id — update a single resource. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  let body: Partial<Resource>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const existing = await prisma.resource.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const updated = await prisma.resource.update({
    where: { id },
    data: fromResource({ ...(toResource(existing)), ...(body as Resource), id }),
  })
  void logAction({
    ...actorFromAuth(auth),
    action: 'resource.update', targetType: 'resource', targetId: id,
    summary: `编辑资源 ${body.name ?? id}`,
  })
  return NextResponse.json(toResource(updated))
}

/** DELETE /api/resources/:id — delete a single resource. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  try {
    await prisma.resource.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  void logAction({
    ...actorFromAuth(auth),
    action: 'resource.delete', targetType: 'resource', targetId: id,
    summary: `删除资源 ${id}`,
  })
  return NextResponse.json({ ok: true })
}
