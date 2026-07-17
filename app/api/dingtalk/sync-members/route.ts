import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import { listDeptMembers, titleToRole } from '@/lib/dingtalk-admin'

/**
 * POST /api/dingtalk/sync-members
 * Admin-triggered: fetch all members under DINGTALK_DEPT_ID and upsert them
 * into Person (keyed by unionid → Person.dingUserId). Also links any existing
 * User(provider="dingtalk") whose externalId matches a synced Person.
 *
 * Returns { total, created, updated, linked }.
 */
export async function POST() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const members = await listDeptMembers()
    let created = 0
    let updated = 0

    for (const m of members) {
      if (!m.unionid) continue
      const role = titleToRole(m.title)
      const existing = await prisma.person.findFirst({ where: { dingUserId: m.unionid } })

      if (existing) {
        await prisma.person.update({
          where: { id: existing.id },
          data: {
            name: m.name,
            role,
            ...(m.email ? { email: m.email } : {}),
            ...(m.mobile ? { phone: m.mobile } : {}),
          },
        })
        updated++
      } else {
        await prisma.person.create({
          data: {
            id: `dt-${m.userid}`,
            name: m.name,
            role,
            dingUserId: m.unionid,
            status: 'absent',
            ...(m.email ? { email: m.email } : {}),
            ...(m.mobile ? { phone: m.mobile } : {}),
          },
        })
        created++
      }
    }

    // Link existing DingTalk login users to their synced Person
    let linked = 0
    const dtUsers = await prisma.user.findMany({ where: { provider: 'dingtalk', personId: null } })
    for (const u of dtUsers) {
      const person = await prisma.person.findFirst({ where: { dingUserId: u.externalId } })
      if (person) {
        await prisma.user.update({ where: { id: u.id }, data: { personId: person.id } })
        linked++
      }
    }

    return NextResponse.json({ total: members.length, created, updated, linked })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
