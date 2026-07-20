import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'

/**
 * PATCH /api/users/:id — edit a login account. Admin-only. Body (all optional):
 *   { role?: 'admin' | 'member', personId?: string | null, disabled?: boolean }
 *
 * Self-protection: an admin cannot demote or ban themselves (would risk
 * lockout). Changing your own personId link is allowed (it's not a privilege).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  let body: { role?: string; personId?: string | null; disabled?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Self-protection: actor (from session) cannot change their own role or
  // ban themselves. personId changes are permitted.
  const isSelf = auth.userId === id
  if (isSelf && (body.role !== undefined || body.disabled !== undefined)) {
    return NextResponse.json(
      { error: '不能修改自己的角色或封禁状态' },
      { status: 400 },
    )
  }

  const data: {
    role?: string
    personId?: string | null
    disabledAt?: Date | null
  } = {}

  if (body.role !== undefined) {
    if (body.role !== 'admin' && body.role !== 'member') {
      return NextResponse.json({ error: 'role must be admin or member' }, { status: 400 })
    }
    data.role = body.role
  }

  if (body.personId !== undefined) {
    // null = unlink; a string must reference an existing Person (FK enforced).
    data.personId = body.personId
  }

  if (body.disabled !== undefined) {
    // Strict boolean only — reject "true"/1/etc. so a non-boolean value can't
    // be coerced into a ban (and the self-ban guard above covers ANY disabled
    // request, truthy or falsy).
    if (typeof body.disabled !== 'boolean') {
      return NextResponse.json({ error: 'disabled must be a boolean' }, { status: 400 })
    }
    data.disabledAt = body.disabled ? new Date() : null
  }

  try {
    await prisma.user.update({ where: { id }, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    // FK violation (bad personId) or missing row.
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  // Determine what changed for the summary.
  const changes: string[] = []
  if (data.role) changes.push(`role→${data.role}`)
  if (data.disabledAt !== undefined) changes.push(data.disabledAt ? '封禁' : '解封')
  if (data.personId !== undefined) changes.push(`person→${data.personId ?? 'null'}`)
  void logAction({
    ...actorFromAuth(auth),
    action: 'user.update', targetType: 'user', targetId: id,
    summary: `修改用户 ${id}${changes.length ? `（${changes.join('，')}）` : ''}`,
  })
  return NextResponse.json({ ok: true })
}
