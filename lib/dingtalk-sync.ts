import { prisma } from '@/lib/db'
import {
  getEnterpriseAccessToken,
  listDeptMembers,
  fetchAttendance,
  fetchLeaveStatus,
  fetchTripStatus,
  mapStatusForDay,
} from '@/lib/dingtalk-admin'
import { todayDateStr, shiftDate, dateRangeDays } from '@/lib/attendance'

/** Setting key for the last finalized day ("yyyy-MM-dd"). Days up to and
 * including this value are considered stable and won't be re-finalized. */
const LAST_FINALIZED_KEY = 'attendance.lastFinalizedDate'

async function readLastFinalized(): Promise<string> {
  // Default to yesterday on first run so the very first sync does nothing for
  // history (no data exists yet) and just refreshes today's live state. The
  // next day's sync finalizes "yesterday" normally.
  const row = await prisma.setting.findUnique({ where: { key: LAST_FINALIZED_KEY } })
  if (row?.value) return row.value
  return shiftDate(todayDateStr(), -1)
}

async function writeLastFinalized(day: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: LAST_FINALIZED_KEY },
    create: { key: LAST_FINALIZED_KEY, value: day },
    update: { value: day },
  })
}

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
    // Store the DingTalk 职位 (title) verbatim — preserves the real title
    // (研究员/工程师/访问学者/...) instead of collapsing it to a fixed enum.
    // A blank/whitespace title is treated as "no title" so it doesn't wipe a
    // manually-set role on re-sync; the UI shows blank as "—".
    const title = m.title?.trim() || ''
    const hasTitle = title !== ''
    const existing = await prisma.person.findFirst({ where: { dingUserId: m.unionid } })

    if (existing) {
      await prisma.person.update({
        where: { id: existing.id },
        data: {
          name: m.name,
          // Only overwrite the title when DingTalk provided a non-empty one,
          // so a missing/blank title field doesn't wipe a manually-set role.
          ...(hasTitle ? { role: title } : {}),
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
          // New person: store whatever title DingTalk gave (blank → '').
          role: title,
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
 * Sync attendance with a finalize double-track flow:
 *
 *  - **Today (live)**: always refreshed — update Person.status / lastSeen /
 *    avatar so the personnel board reflects who's currently in. Today's data
 *    is volatile (people keep punching in through the day), so re-pulling it
 *    on every sync is necessary, not wasteful.
 *  - **Finalize (history)**: any day strictly AFTER `lastFinalizedDate` and
 *    strictly BEFORE today is "stable" — it gets written once into
 *    AttendanceRecord and never re-pulled. The fetch window is widened to
 *    [dayBefore, today] (max 3 days) so a late punch on the day before the
 *    finalized one isn't lost. Failure does NOT advance the water mark, so
 *    the next sync retries the same window.
 *
 * On the very first run (no Setting) lastFinalizedDate defaults to yesterday,
 * so nothing is finalized and only today's live state is written; the next
 * day's sync finalizes "yesterday" normally.
 *
 * Extracted from the sync-attendance route so both the HTTP route and the
 * scheduler can call it. Returns aggregate stats (today's live state) for the
 * caller's SyncLog entry.
 */
export async function syncAttendance(): Promise<{
  total: number
  stats: { present: number; leave: number; trip: number; absent: number }
  finalizedDays: number
  message?: string
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
    return {
      total: 0,
      stats: { present: 0, leave: 0, trip: 0, absent: 0 },
      finalizedDays: 0,
      message: '没有同步的钉钉成员，请先执行成员同步',
    }
  }

  const today = todayDateStr()
  const yesterday = shiftDate(today, -1)
  const lastFinalized = await readLastFinalized()

  // Days to finalize = (lastFinalized, yesterday]. Empty on first run or if
  // already up to date.
  const daysToFinalize: string[] = lastFinalized < yesterday
    ? dateRangeDays(shiftDate(lastFinalized, 1), yesterday)
    : []

  // Fetch window: cover the oldest day to finalize minus one (late-punch
  // protection), through today. Cap to [today-2, today] so a long outage
  // doesn't pull a huge window in one call.
  const oldestNeeded = daysToFinalize.length > 0 ? shiftDate(daysToFinalize[0], -1) : yesterday
  const windowStart = oldestNeeded < shiftDate(today, -2) ? shiftDate(today, -2) : oldestNeeded
  const queryDays = dateRangeDays(windowStart, today)

  const [attByDay, leaveByDay, tripByDay] = await Promise.all([
    fetchAttendance(token, userids, windowStart, today),
    fetchLeaveStatus(token, userids, windowStart, today),
    fetchTripStatus(token, userids, queryDays),
  ])

  // 1. Finalize history: upsert one AttendanceRecord per (person, day).
  for (const day of daysToFinalize) {
    for (const [userid, personId] of useridToPersonId) {
      const { status, onDuty, offDuty } = mapStatusForDay(userid, day, tripByDay, leaveByDay, attByDay)
      await prisma.attendanceRecord.upsert({
        where: { personId_date: { personId, date: day } },
        create: {
          personId,
          date: day,
          status,
          checkIn: onDuty?.checkTime ?? null,
          checkOut: offDuty?.checkTime ?? null,
        },
        update: {
          status,
          checkIn: onDuty?.checkTime ?? null,
          checkOut: offDuty?.checkTime ?? null,
        },
      })
    }
  }

  // 2. Update today's live state on Person rows + collect stats.
  const stats = { present: 0, leave: 0, trip: 0, absent: 0 }
  for (const [userid, personId] of useridToPersonId) {
    const { status, onDuty } = mapStatusForDay(userid, today, tripByDay, leaveByDay, attByDay)
    stats[status]++
    const tripReason = tripByDay.get(userid)?.reason
    await prisma.person.update({
      where: { id: personId },
      data: {
        status,
        // lastSeen = today's OnDuty punch time, cleared if no punch
        ...(onDuty?.checkTime ? { lastSeen: onDuty.checkTime } : { lastSeen: null }),
        // avatar repurposed as today's trip reason (cleared if not on trip)
        ...(tripReason ? { avatar: tripReason } : { avatar: null }),
      },
    })
  }

  // 3. Advance the water mark only after both writes succeed.
  if (daysToFinalize.length > 0) {
    await writeLastFinalized(yesterday)
  }

  return { total: userids.length, stats, finalizedDays: daysToFinalize.length }
}

/**
 * One-shot backfill for a single day (admin-triggered). Re-pulls that day from
 * DingTalk and upserts its AttendanceRecord regardless of the finalize water
 * mark. Does NOT advance lastFinalizedDate (the regular flow owns that).
 */
export async function backfillDay(day: string): Promise<{ upserted: number }> {
  const token = await getEnterpriseAccessToken()
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
  if (userids.length === 0) return { upserted: 0 }

  const [attByDay, leaveByDay, tripByDay] = await Promise.all([
    fetchAttendance(token, userids, day, day),
    fetchLeaveStatus(token, userids, day, day),
    fetchTripStatus(token, userids, [day]),
  ])

  let upserted = 0
  for (const [userid, personId] of useridToPersonId) {
    const { status, onDuty, offDuty } = mapStatusForDay(userid, day, tripByDay, leaveByDay, attByDay)
    await prisma.attendanceRecord.upsert({
      where: { personId_date: { personId, date: day } },
      create: {
        personId,
        date: day,
        status,
        checkIn: onDuty?.checkTime ?? null,
        checkOut: offDuty?.checkTime ?? null,
      },
      update: {
        status,
        checkIn: onDuty?.checkTime ?? null,
        checkOut: offDuty?.checkTime ?? null,
      },
    })
    upserted++
  }
  return { upserted }
}
