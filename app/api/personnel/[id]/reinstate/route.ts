import { assertSameOrigin } from '@/lib/csrf'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import { toSafeError } from '@/lib/safe-error'

/**
 * POST /api/personnel/[id]/reinstate
 *
 * Reverse of /offboard: re-enable the person's login User(s). Their status
 * stays absent until the next attendance sync sees them (which only happens
 * if they were re-added on the DingTalk side) — reinstating a person who is
 * still off-org leaves them as a plain absent row, which is honest.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const __csrf = assertSameOrigin(req)
  if (__csrf) return __csrf
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  try {
    const person = await prisma.person.findUnique({ where: { id } })
    if (!person) return NextResponse.json({ error: '人员不存在' }, { status: 404 })

    const reenabled = await prisma.user.updateMany({ where: { personId: id, disabledAt: { not: null } }, data: { disabledAt: null } })

    void logAction({
      ...actorFromAuth(auth),
      action: 'person.reinstate', targetType: 'person', targetId: id,
      summary: `恢复人员 ${person.name} 的登录（${reenabled.count} 个账号）`,
    })
    return NextResponse.json({ ok: true, usersReenabled: reenabled.count })
  } catch (e) {
    const { message: msg } = toSafeError(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
