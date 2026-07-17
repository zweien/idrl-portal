import { prisma } from '@/lib/db'
import {
  getEnterpriseAccessToken,
  listDeptMembers,
  titleToRole,
  fetchAttendance,
  fetchLeaveStatus,
  fetchTripStatus,
  mapStatus,
} from '@/lib/dingtalk-admin'

/**
 * Sync DingTalk department members into Person rows (keyed by unionid) and
 * link unlinked DingTalk login Users. Extracted from the sync-members route so
 * both the HTTP route and the background scheduler can call it. Returns
 * aggregate stats; callers decide where to persist a SyncLog entry.
 */
export async function syncMembers(): Promise<{
  total: number
  created: number
  updated: number
  linked: number
}> {
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

  return { total: members.length, created, updated, linked }
}

/**
 * Sync today's attendance/leave/trip for all DingTalk-synced persons, applying
 * the status priority trip > leave > present > absent. Extracted from the
 * sync-attendance route so both the HTTP route and the scheduler can call it.
 */
export async function syncAttendance(): Promise<{
  total: number
  stats: { present: number; leave: number; trip: number; absent: number }
}> {
  const token = await getEnterpriseAccessToken()

  // Find all persons synced from DingTalk (id starts with 'dt-')
  const dtPersons = await prisma.person.findMany({
    where: { id: { startsWith: 'dt-' } },
    select: { id: true },
  })

  const useridToPersonId = new Map<string, string>()
  for (const p of dtPersons) {
    const userid = p.id.replace(/^dt-/, '')
    if (userid) useridToPersonId.set(userid, p.id)
  }

  const userids = [...useridToPersonId.keys()]
  if (userids.length === 0) {
    return { total: 0, stats: { present: 0, leave: 0, trip: 0, absent: 0 } }
  }

  const [attendanceMap, leaveSet, tripMap] = await Promise.all([
    fetchAttendance(token, userids),
    fetchLeaveStatus(token, userids),
    fetchTripStatus(token, userids),
  ])

  const stats = { present: 0, leave: 0, trip: 0, absent: 0 }
  for (const [userid, personId] of useridToPersonId) {
    const status = mapStatus(userid, tripMap, leaveSet, attendanceMap)
    stats[status]++
    const att = attendanceMap.get(userid)
    const tripReason = tripMap.get(userid)
    await prisma.person.update({
      where: { id: personId },
      data: {
        status,
        // lastSeen = punch time (e.g. "08:01"), cleared if no punch
        ...(att?.checkTime ? { lastSeen: att.checkTime } : { lastSeen: null }),
        // avatar repurposed as trip reason (cleared if not on trip)
        ...(tripReason ? { avatar: tripReason } : { avatar: null }),
      },
    })
  }

  return { total: userids.length, stats }
}
