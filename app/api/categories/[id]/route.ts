import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toCategory } from '@/lib/db/serialize'
import { requireAdmin } from '@/lib/auth-api'
import type { Category } from '@/lib/types'

/** PATCH /api/categories/:id — rename / reorder a category. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  let body: Partial<Category>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  try {
    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
      },
    })
    return NextResponse.json(toCategory(updated))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

/** DELETE /api/categories/:id — delete a category. News/resources keep their
 * rows (categoryId set to null via onDelete:SetNull). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  try {
    await prisma.category.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
