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
import { resetDingtalkCallCount, getDingtalkCallCount } from '@/lib/dingtalk-admin'
import type { SyncProgress } from '@/lib/sync-task'

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

/**
 * Sync DingTalk department members into Person rows (keyed by unionid) and
 * link unlinked DingTalk login Users. Extracted from the sync-members route so
 * both the HTTP route and the background scheduler can call it. Returns
 * aggregate stats; callers decide where to persist a SyncLog entry.
 */
/** A person detected as no longer synced, for the offboard UI. */
export interface DepartedMember {
  id: string
  name: string
}

export async function syncMembers(progress?: SyncProgress): Promise<{
  total: number
  created: number
  updated: number
  linked: number
  /** Person rows whose embedded userid was refreshed (DingTalk delete+re-add). */
  renamed: number
  /** unionid gone from the whole DingTalk org (resigned / account deleted). */
  offboarded: DepartedMember[]
  /** unionid still in DingTalk but outside the synced department subtree (transferred out). */
  transferred: DepartedMember[]
}> {
  resetDingtalkCallCount()
  progress?.stage('fetch')
  const members = await listDeptMembers()
  let created = 0
  let updated = 0
  let linked = 0
  let renamed = 0

  // All member writes + the subsequent user-link pass run inside one
  // transaction so a mid-sync failure (network blip, SQLITE_BUSY) rolls back
  // the partial member set instead of leaving half-linked rows. The network
  // call (listDeptMembers) is already done above, so the tx body is DB-only.
  // Counters are declared outside and mutated inside the tx callback.
  progress?.stage('write')
  await prisma.$transaction(async (tx) => {
    for (const m of members) {
      if (!m.unionid) continue
      // Store the DingTalk 职位 (title) verbatim — preserves the real title
      // (研究员/工程师/访问学者/...) instead of collapsing it to a fixed enum.
      // A blank/whitespace title is treated as "no title" so it doesn't wipe a
      // manually-set role on re-sync; the UI shows blank as "—".
      const title = m.title?.trim() || ''
      const hasTitle = title !== ''
      const existing = await tx.person.findFirst({ where: { dingUserId: m.unionid } })

      if (existing) {
        // A delete+re-add in DingTalk keeps the unionid but mints a NEW userid.
        // Person.id embeds the userid (`dt-<userid>`) and the attendance API
        // queries by it — a stale id makes every sync see the person as absent
        // forever. Prisma cannot update an @id, so cascade-rename via raw SQL:
        // reference tables first, then the Person row itself (FK checks are
        // deferred inside the tx).
        const newId = `dt-${m.userid}`
        if (existing.id !== newId) {
          const clash = await tx.person.findUnique({ where: { id: newId } })
          if (clash) {
            // A row with the target id exists (shouldn't happen when the
            // unionid is the match key) — keep both rather than merge silently.
            console.error(`sync-members: cannot rename ${existing.id} -> ${newId}, target id already taken by ${clash.name}`)
          } else {
            await tx.$executeRaw`PRAGMA defer_foreign_keys = ON`
            await tx.$executeRaw`UPDATE AttendanceRecord SET personId = ${newId} WHERE personId = ${existing.id}`
            await tx.$executeRaw`UPDATE Workstation SET personId = ${newId} WHERE personId = ${existing.id}`
            await tx.$executeRaw`UPDATE User SET personId = ${newId} WHERE personId = ${existing.id}`
            await tx.$executeRaw`UPDATE Person SET id = ${newId} WHERE id = ${existing.id}`
            renamed++
            existing.id = newId
          }
        }
        await tx.person.update({
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
        // New person: store whatever title DingTalk gave (blank → '').
        // An org migration can leave a stale row reusing the same `dt-<userid>`
        // id (userid is per-org; collisions across migrations are possible) whose
        // unionid no longer matches. On a PK clash, adopt that row instead of
        // failing the whole sync.
        const newId = `dt-${m.userid}`
        const data = {
          name: m.name,
          role: title,
          dingUserId: m.unionid,
          status: 'absent' as const,
          ...(m.email ? { email: m.email } : {}),
          ...(m.mobile ? { phone: m.mobile } : {}),
        }
        try {
          await tx.person.create({ data: { id: newId, ...data } })
        } catch (e) {
          if (e instanceof Error && /Unique constraint failed/.test(e.message)) {
            await tx.person.update({ where: { id: newId }, data })
          } else {
            throw e
          }
        }
        created++
      }
    }

    // Link existing DingTalk login users to their synced Person (same tx so a
    // half-linked set can't survive a failure).
    const dtUsers = await tx.user.findMany({ where: { provider: 'dingtalk', personId: null } })
    for (const u of dtUsers) {
      const person = await tx.person.findFirst({ where: { dingUserId: u.externalId } })
      if (person) {
        await tx.user.update({ where: { id: u.id }, data: { personId: person.id } })
        linked++
      }
    }
  })

  // ---- Departure detection ----
  // Pull the WHOLE org (root dept 1) and classify every synced person not in
  // the configured subtree: unionid gone entirely = offboarded (resigned /
  // account deleted); unionid present but outside the subtree = transferred
  // out. Detection is computed live (never persisted) — the UI offers a
  // deliberate offboard action instead of the sync deleting anything.
  let offboarded: DepartedMember[] = []
  let transferred: DepartedMember[] = []
  try {
    const orgMembers = await listDeptMembers(1)
    const subtreeUnions = new Set(members.map(m => m.unionid).filter(Boolean))
    const orgUnions = new Set(orgMembers.map(m => m.unionid).filter(Boolean))
    const dtPersons = await prisma.person.findMany({
      where: { id: { startsWith: 'dt-' } },
      select: { id: true, name: true, dingUserId: true },
    })
    for (const p of dtPersons) {
      // Rows without a unionid are local/manual persons (never DingTalk
      // synced) — they are not departure candidates.
      if (!p.dingUserId) continue
      if (orgUnions.has(p.dingUserId) === false) {
        offboarded.push({ id: p.id, name: p.name })
      } else if (subtreeUnions.has(p.dingUserId) === false) {
        transferred.push({ id: p.id, name: p.name })
      }
    }
  } catch (e) {
    // Detection must not fail the sync itself — it is advisory.
    console.error('sync-members departure detection failed:', e)
  }

  return { total: members.length, created, updated, linked, renamed, offboarded, transferred }
}

/**
 * Sync attendance with a finalize double-track flow:
 *
 *  - **Today (live)**: always refreshed — update Person.status / lastSeen /
 *    avatar so the personnel board reflects who's currently in, AND upsert
 *    today's AttendanceRecord so the early-bird leaderboard shows today's
 *    punches immediately. Today's data is volatile (people keep punching in
 *    through the day), so re-pulling it on every sync is necessary, not
 *    wasteful; the upsert is idempotent (same (personId, today) row
 *    overwritten each time).
 *  - **Finalize (history)**: any day strictly AFTER `lastFinalizedDate` and
 *    strictly BEFORE today is "stable" — it gets written into AttendanceRecord
 *    and never re-pulled as its own row (today's live upsert already covers
 *    the edge). The fetch window is widened to [dayBefore, today] (max 3
 *    days) so a late punch on the day before the finalized one isn't lost.
 *    Failure does NOT advance the water mark, so the next sync retries the
 *    same window.
 *
 * On the very first run (no Setting) lastFinalizedDate defaults to yesterday,
 * so nothing is finalized and only today's live state is written; the next
 * day's sync finalizes "yesterday" normally.
 *
 * Extracted from the sync-attendance route so both the HTTP route and the
 * scheduler can call it. Returns aggregate stats (today's live state) for the
 * caller's SyncLog entry.
 */
export async function syncAttendance(progress?: SyncProgress): Promise<{
  total: number
  stats: { present: number; leave: number; trip: number; absent: number }
  finalizedDays: number
  message?: string
  /** Per-stage wall time (ms) + DingTalk call count, for SyncLog stats. */
  timings?: { attendanceMs: number; leaveMs: number; tripMs: number; writeMs: number; dingtalkCalls: number }
}> {
  resetDingtalkCallCount()
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
  // already up to date. Cap to the days actually covered by the fetch window
  // (see below) so a long outage doesn't write "absent" for unfetched dates
  // and then advance the water mark past them (Codex P1: the bounded window
  // [today-2, today] means anything older than today-2 was never pulled, so
  // finalizing it would permanently corrupt those days). Older days are
  // left unfinalized — the next sync will pull them as the window advances.
  const allMissedDays: string[] = lastFinalized < yesterday
    ? dateRangeDays(shiftDate(lastFinalized, 1), yesterday)
    : []

  // Fetch window: cover the oldest day to finalize minus one (late-punch
  // protection), through today. Cap to [today-2, today] so a long outage
  // doesn't pull a huge window in one call.
  const oldestNeeded = allMissedDays.length > 0 ? shiftDate(allMissedDays[0], -1) : yesterday
  const windowStart = oldestNeeded < shiftDate(today, -2) ? shiftDate(today, -2) : oldestNeeded
  const queryDays = dateRangeDays(windowStart, today)

  // Only finalize the days that are actually inside the fetched window —
  // anything older than windowStart wasn't pulled this run and must wait.
  const daysToFinalize = allMissedDays.filter(d => d >= windowStart)

  // Fetches run sequentially (not Promise.all) so the sync-task progress can
  // report each stage honestly; the serialization costs ~1-2s against an
  // 80s-plus run dominated by the trip-detail stage.
  progress?.stage('attendance')
  const tAtt = Date.now()
  const attByDay = await fetchAttendance(token, userids, windowStart, today)
  const attMs = Date.now() - tAtt

  progress?.stage('leave')
  const tLeave = Date.now()
  const leaveByDay = await fetchLeaveStatus(token, userids, windowStart, today)
  const leaveMs = Date.now() - tLeave

  progress?.stage('trip')
  const tTrip = Date.now()
  const tripByDay = await fetchTripStatus(token, userids, queryDays, (done, total) =>
    progress?.counter('拉取出差审批详情', done, total),
  )
  const tripMs = Date.now() - tTrip

  // All DB writes (history finalize + today's live state + watermark advance)
  // run inside one transaction. This keeps the watermark advance atomic with
  // the records it covers: if the write batch fails partway, the watermark
  // isn't advanced, so the next sync retries the whole window. Network calls
  // are done above; the tx body is DB-only.
  const stats = { present: 0, leave: 0, trip: 0, absent: 0 }
  progress?.stage('write')
  const tWrite = Date.now()
  await prisma.$transaction(async (tx) => {
    // 1. Finalize history: upsert one AttendanceRecord per (person, day).
    for (const day of daysToFinalize) {
      for (const [userid, personId] of useridToPersonId) {
        const { status, onDuty, offDuty } = mapStatusForDay(userid, day, tripByDay, leaveByDay, attByDay)
        await tx.attendanceRecord.upsert({
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

    // 2. Update today's live state on Person rows + collect stats. ALSO upsert
    // today's AttendanceRecord so the early-bird leaderboard shows today's
    // punches immediately (previously it waited until tomorrow's finalize,
    // leaving the board empty all day). The upsert is idempotent — re-syncs
    // overwrite the same row; tomorrow's finalize of "yesterday" re-pulls this
    // day in the 3-day window and upserts again, correcting any late punches.
    for (const [userid, personId] of useridToPersonId) {
      const { status, onDuty, offDuty } = mapStatusForDay(userid, today, tripByDay, leaveByDay, attByDay)
      stats[status]++
      const tripReason = tripByDay.get(userid)?.reason
      await tx.person.update({
        where: { id: personId },
        data: {
          status,
          // lastSeen = today's OnDuty punch time, cleared if no punch
          ...(onDuty?.checkTime ? { lastSeen: onDuty.checkTime } : { lastSeen: null }),
          // avatar repurposed as today's trip reason (cleared if not on trip)
          ...(tripReason ? { avatar: tripReason } : { avatar: null }),
        },
      })
      await tx.attendanceRecord.upsert({
        where: { personId_date: { personId, date: today } },
        create: {
          personId,
          date: today,
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

    // 3. Advance the water mark (inside the tx so it commits with the records).
    //  - When we finalized a subset (long outage), advance only to the LAST day
    //    actually finalized, NOT yesterday — the unfinalized older days must be
    //    retried on the next sync (advancing past them would skip them).
    //  - When there were no days to finalize (first run / already up to date),
    //    still PERSIST the bootstrap value (otherwise a fresh deploy recomputes
    //    "yesterday" every run and never creates the setting, so the regular
    //    flow never finalizes historical records).
    const nextFinalized = daysToFinalize.length > 0
      ? daysToFinalize[daysToFinalize.length - 1]
      : lastFinalized
    await tx.setting.upsert({
      where: { key: LAST_FINALIZED_KEY },
      create: { key: LAST_FINALIZED_KEY, value: nextFinalized },
      update: { value: nextFinalized },
    })
  })

  return {
    total: userids.length,
    stats,
    finalizedDays: daysToFinalize.length,
    timings: {
      attendanceMs: attMs,
      leaveMs: leaveMs,
      tripMs: tripMs,
      writeMs: Date.now() - tWrite,
      dingtalkCalls: getDingtalkCallCount(),
    },
  }
}

/**
 * Flatten the attendance sync result for SyncLog.stats persistence:
 * `{total, stats:{present,leave,trip,absent}, finalizedDays}` →
 * `{total, present, leave, trip, absent, finalizedDays}`. The nested `stats`
 * key used to leak into the log row, producing a confusing `stats.stats`.
 */
export function flattenAttendanceStats(
  result: { total: number; stats: { present: number; leave: number; trip: number; absent: number }; finalizedDays: number; timings?: Record<string, unknown> },
): Record<string, unknown> {
  return {
    total: result.total,
    finalizedDays: result.finalizedDays,
    ...result.stats,
    // Per-stage durations (ms) + dingtalkCalls — the sync-cost record.
    ...(result.timings ?? {}),
  }
}

/**
 * One-shot backfill for a single day (admin-triggered). Re-pulls that day from
 * DingTalk and upserts its AttendanceRecord regardless of the finalize water
 * mark. Does NOT advance lastFinalizedDate (the regular flow owns that).
 */
export async function backfillDay(day: string, progress?: SyncProgress): Promise<{ upserted: number }> {
  resetDingtalkCallCount()
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

  progress?.stage('fetch')
  const attByDay = await fetchAttendance(token, userids, day, day)
  const leaveByDay = await fetchLeaveStatus(token, userids, day, day)
  const tripByDay = await fetchTripStatus(token, userids, [day], (done, total) =>
    progress?.counter('拉取出差审批详情', done, total),
  )

  let upserted = 0
  progress?.stage('write')
  // One transaction for the whole day's upserts: a mid-loop failure rolls
  // back the partial day so a retry re-pulls cleanly. Network calls are done.
  await prisma.$transaction(async (tx) => {
    for (const [userid, personId] of useridToPersonId) {
      const { status, onDuty, offDuty } = mapStatusForDay(userid, day, tripByDay, leaveByDay, attByDay)
      await tx.attendanceRecord.upsert({
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
  })
  return { upserted }
}
