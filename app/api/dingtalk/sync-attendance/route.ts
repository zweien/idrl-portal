import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import {
  getEnterpriseAccessToken,
  fetchAttendance,
  fetchLeaveStatus,
  fetchTripStatus,
  mapStatus,
} from '@/lib/dingtalk-admin'

/**
 * POST /api/dingtalk/sync-attendance
 * Admin-triggered: fetch today's attendance/leave/trip for all synced
 * DingTalk persons and update their status per the priority:
 * trip > leave > present(Normal punch) > absent.
 *
 * Returns { total, stats: { present, leave, trip, absent } }.
 */
export async function POST() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const token = await getEnterpriseAccessToken()

    // Find all persons synced from DingTalk (id starts with 'dt-')
    const dtPersons = await prisma.person.findMany({
      where: { id: { startsWith: 'dt-' } },
      select: { id: true },
    })

    // Extract DingTalk userids from Person ids (dt-<userid> → <userid>)
    const useridToPersonId = new Map<string, string>()
    for (const p of dtPersons) {
      const userid = p.id.replace(/^dt-/, '')
      if (userid) useridToPersonId.set(userid, p.id)
    }

    const userids = [...useridToPersonId.keys()]
    if (userids.length === 0) {
      return NextResponse.json({ total: 0, stats: { present: 0, leave: 0, trip: 0, absent: 0 }, message: '没有同步的钉钉成员，请先执行成员同步' })
    }

    // Fetch all three data sources in parallel
    const [attendanceMap, leaveSet, tripSet] = await Promise.all([
      fetchAttendance(token, userids),
      fetchLeaveStatus(token, userids),
      fetchTripStatus(token, userids),
    ])

    // Map statuses and batch update
    const stats = { present: 0, leave: 0, trip: 0, absent: 0 }
    for (const [userid, personId] of useridToPersonId) {
      const status = mapStatus(userid, tripSet, leaveSet, attendanceMap)
      stats[status]++
      await prisma.person.update({
        where: { id: personId },
        data: { status },
      })
    }

    return NextResponse.json({ total: userids.length, stats })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
