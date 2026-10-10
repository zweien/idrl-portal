import { assertSameOrigin } from '@/lib/csrf'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import { toSafeError } from '@/lib/safe-error'

/**
 * POST /api/personnel/[id]/offboard
 *
 * Admin action from the departure-detection UI: the person's unionid is gone
 * from DingTalk (or they transferred out of the synced subtree), so stop
 * tracking them as an active member —
 *   1. Person.status -> absent (board counts stay honest)
 *   2. clear their workstation assignment (one-person-one-workstation frees up)
 *   3. disable their login User (disabledAt soft-ban, reused)
 * Attendance history is KEPT (compliance data); fully reversible via
 * /reinstate + re-adding them on the DingTalk side.
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

    const result = await prisma.$transaction(async (tx) => {
      // Keep the FIRST offboard timestamp — atomically (COALESCE), so two
      // concurrent offboards cannot both observe null and replace each
      // other's marker: the reinstate scoping compares disabledAt >=
      // offboardedAt, and a replaced marker would orphan the accounts the
      // first request disabled.
      await tx.$executeRaw`UPDATE Person SET offboardedAt = COALESCE(offboardedAt, ${new Date()}) WHERE id = ${id}`
      const ws = await tx.workstation.updateMany({ where: { personId: id }, data: { personId: null } })
      // Never disable the caller's own account: banning yourself through a
      // person-offboard would lock a (possibly sole) admin out mid-session.
      const users = await tx.user.updateMany({
        where: { personId: id, disabledAt: null, id: { not: auth.userId } },
        data: { disabledAt: new Date() },
      })
      return { workstationsCleared: ws.count, usersDisabled: users.count }
    })

    void logAction({
      ...actorFromAuth(auth),
      action: 'person.offboard', targetType: 'person', targetId: id,
      summary: `停用离组织人员 ${person.name}（清工位 ${result.workstationsCleared}，禁登录 ${result.usersDisabled}）`,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const { message: msg } = toSafeError(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
