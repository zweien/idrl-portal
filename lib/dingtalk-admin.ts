/**
 * DingTalk enterprise admin API helpers.
 *
 * Server-side access to the DingTalk org (members, departments) via the
 * enterprise access_token (NOT the user login OAuth2 flow in dingtalk.ts).
 * Used by member sync (#27) and attendance mapping (#28).
 *
 * access_token is cached in-memory and refreshed ~5 min before expiry.
 */

import {
  dateStr as shanghaiDateStr,
  dateRangeDays,
  dayBounds,
  SHANGHAI_TZ,
} from '@/lib/attendance'
export { dayBounds } from '@/lib/attendance'

const TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/accessToken'
const DEPT_LIST_URL = 'https://oapi.dingtalk.com/topapi/v2/department/listsub'
const USER_LIST_URL = 'https://oapi.dingtalk.com/topapi/v2/user/list'

export interface DingTalkMember {
  /** Enterprise-internal user id (needed for attendance queries). */
  userid: string
  /** Cross-app stable id (used as Person.dingUserId). */
  unionid: string
  name: string
  title?: string
  jobNumber?: string
  email?: string
  mobile?: string
  deptIdList: number[]
  active: boolean
  leader?: boolean
}

export interface DingTalkDept {
  deptId: number
  name: string
  parentId: number
}

// ── access_token (cached) ─────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null

function getCredentials() {
  const appKey = process.env.DINGTALK_CLIENT_ID
  const appSecret = process.env.DINGTALK_CLIENT_SECRET
  if (!appKey || !appSecret) return null
  return { appKey, appSecret }
}

/**
 * Get the enterprise access_token, refreshing ~5 min before expiry.
 * Throws if the app isn't configured.
 */
export async function getEnterpriseAccessToken(): Promise<string> {
  const creds = getCredentials()
  if (!creds) throw new Error('DingTalk not configured (DINGTALK_CLIENT_ID/SECRET)')

  // Reuse cached token if it has > 5 min left
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.token
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appKey: creds.appKey, appSecret: creds.appSecret }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DingTalk accessToken failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { accessToken: string; expireIn: number }
  cachedToken = {
    token: data.accessToken,
    expiresAt: Date.now() + data.expireIn * 1000,
  }
  return data.accessToken
}

// ── departments ───────────────────────────────────────

/**
 * List the direct sub-departments of a department (one level).
 */
export async function listSubDepartments(accessToken: string, deptId: number): Promise<DingTalkDept[]> {
  const res = await fetch(`${DEPT_LIST_URL}?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dept_id: deptId }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DingTalk listsub failed: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { errcode?: number; errmsg?: string; result?: Array<{ dept_id: number; name: string; parent_id: number }> }
  if (data.errcode) {
    throw new Error(`DingTalk listsub error: ${data.errcode} ${data.errmsg}`)
  }
  return (data.result ?? []).map(d => ({
    deptId: d.dept_id,
    name: d.name,
    parentId: d.parent_id,
  }))
}

/**
 * Recursively collect all department ids under `rootDeptId` (inclusive of root).
 */
export async function collectAllDeptIds(accessToken: string, rootDeptId: number): Promise<number[]> {
  const result: number[] = [rootDeptId]
  const queue: number[] = [rootDeptId]
  while (queue.length > 0) {
    const deptId = queue.shift()!
    const subs = await listSubDepartments(accessToken, deptId)
    for (const s of subs) {
      result.push(s.deptId)
      queue.push(s.deptId)
    }
  }
  return result
}

// ── members ───────────────────────────────────────────

/**
 * List members of a single department (paginated). Does NOT recurse.
 */
export async function listDepartmentUsers(accessToken: string, deptId: number): Promise<DingTalkMember[]> {
  const all: DingTalkMember[] = []
  let cursor = 0
  const size = 100
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${USER_LIST_URL}?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dept_id: deptId, cursor, size }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`DingTalk user/list failed (dept ${deptId}): ${res.status} ${text}`)
    }
    const data = (await res.json()) as {
      errcode?: number
      errmsg?: string
      result?: {
        has_more: boolean
        next_cursor?: number
        list?: Array<Record<string, unknown>>
      }
    }
    if (data.errcode) {
      throw new Error(`DingTalk user/list error (dept ${deptId}): ${data.errcode} ${data.errmsg}`)
    }
    const list = data.result?.list ?? []
    for (const m of list) {
      all.push({
        userid: String(m.userid ?? ''),
        unionid: String(m.unionid ?? ''),
        name: String(m.name ?? ''),
        title: m.title ? String(m.title) : undefined,
        jobNumber: m.job_number ? String(m.job_number) : undefined,
        email: m.email ? String(m.email) : undefined,
        mobile: m.mobile ? String(m.mobile) : undefined,
        deptIdList: (m.dept_id_list ?? []) as number[],
        active: Boolean(m.active),
        leader: m.leader ? Boolean(m.leader) : undefined,
      })
    }
    if (!data.result?.has_more) break
    // Use the server-provided cursor when available (more reliable than
    // incrementing locally — DingTalk doesn't guarantee contiguous offsets).
    const next = data.result?.next_cursor
    if (next === undefined || next === null) break
    cursor = next
  }
  return all
}

/**
 * Recursively fetch all members under `rootDeptId` (the dept + all sub-depts).
 * Members appearing in multiple departments are de-duplicated by userid.
 */
export async function listDeptMembers(rootDeptId?: number): Promise<DingTalkMember[]> {
  const token = await getEnterpriseAccessToken()
  const targetRoot = rootDeptId ?? Number(process.env.DINGTALK_DEPT_ID ?? '340351089')
  const allDeptIds = await collectAllDeptIds(token, targetRoot)

  const byUserid = new Map<string, DingTalkMember>()
  for (const deptId of allDeptIds) {
    const members = await listDepartmentUsers(token, deptId)
    for (const m of members) {
      if (m.userid && !byUserid.has(m.userid)) {
        byUserid.set(m.userid, m)
      }
    }
  }
  return [...byUserid.values()]
}

// NOTE: Person.role is now free-text and stores the DingTalk 职位 verbatim
// (see lib/dingtalk-sync.ts). The old titleToRole() enum mapping was removed —
// it collapsed real titles (研究员/工程师/访问学者) to a fixed 6-value enum and
// lost information.

// ── attendance / leave / trip ─────────────────────────

const ATTENDANCE_LIST_URL = 'https://oapi.dingtalk.com/attendance/list'
const LEAVE_STATUS_URL = 'https://oapi.dingtalk.com/topapi/attendance/getleavestatus'
const PROCESS_INSTANCE_URL = 'https://oapi.dingtalk.com/topapi/processinstance/listids'

export type AttendanceResult = 'present' | 'leave' | 'trip' | 'absent'

/** Format a ms epoch as "HH:mm" in Asia/Shanghai. */
function hmInShanghai(ms: number): string {
  return new Date(ms).toLocaleTimeString('zh-CN', { timeZone: SHANGHAI_TZ, hour: '2-digit', minute: '2-digit' })
}

/**
 * Fetch attendance records for a date range (inclusive, Shanghai dates) for a
 * batch of DingTalk userids. Returns a nested Map:
 *   userId → dateStr → DayAttendance (onDuty and/or offDuty punches).
 *
 * Both OnDuty (上班) and OffDuty (下班) records are kept so that work hours
 * can be computed. The day key comes from DingTalk's `workDate` (the shift's
 * calendar day), so a late-night OffDuty punch still belongs to that work day.
 *
 * Throws on DingTalk API failure (don't silently treat errors as absence).
 */
export interface DayPunch {
  timeResult: string // DingTalk raw value (Normal/Late/Early/NotSigned/Absenteeism/SeriousLate)
  checkTime: string // "HH:mm" in Shanghai
}
export interface DayAttendance {
  onDuty?: DayPunch
  offDuty?: DayPunch
}

export async function fetchAttendance(
  accessToken: string,
  userids: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, Map<string, DayAttendance>>> {
  const result = new Map<string, Map<string, DayAttendance>>()
  if (userids.length === 0) return result

  const workDateFrom = `${fromDate} 00:00:00`
  const workDateTo = `${toDate} 23:59:59`

  // attendance/list accepts max 50 userids per call; paginate with offset.
  const USER_BATCH = 50
  for (let i = 0; i < userids.length; i += USER_BATCH) {
    const batch = userids.slice(i, i + USER_BATCH)
    let offset = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(`${ATTENDANCE_LIST_URL}?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workDateFrom, workDateTo, userIdList: batch, offset, limit: 50 }),
        cache: 'no-store',
      })
      if (!res.ok) {
        throw new Error(`attendance/list HTTP ${res.status} for batch starting at ${i}`)
      }
      const data = (await res.json()) as {
        errcode?: number
        errmsg?: string
        recordresult?: Array<Record<string, unknown>>
        hasMore?: boolean
      }
      if (data.errcode) {
        throw new Error(`attendance/list error ${data.errcode}: ${data.errmsg}`)
      }
      for (const r of data.recordresult ?? []) {
        const uid = r.userId ?? r.userid
        const checkType = r.checkType
        const timeResult = r.timeResult
        if (!uid || !checkType || !timeResult) continue
        // The shift's calendar day (ms epoch). Fall back to the punch time's
        // day if DingTalk omits workDate.
        const workDateMs = (r.workDate ?? r.userCheckTime) as number | undefined
        if (!workDateMs) continue
        const dateKey = shanghaiDateStr(workDateMs)
        const userCheckTime = r.userCheckTime as number | undefined
        if (!userCheckTime) continue
        const punch: DayPunch = { timeResult: String(timeResult), checkTime: hmInShanghai(userCheckTime) }
        let byDay = result.get(String(uid))
        if (!byDay) {
          byDay = new Map()
          result.set(String(uid), byDay)
        }
        let day = byDay.get(dateKey)
        if (!day) {
          day = {}
          byDay.set(dateKey, day)
        }
        if (checkType === 'OnDuty') day.onDuty = punch
        else if (checkType === 'OffDuty') day.offDuty = punch
      }
      if (!data.hasMore) break
      offset += 50
    }
  }
  return result
}

/**
 * Fetch leave status for a date range (inclusive, Shanghai dates) for a batch
 * of DingTalk userids. Returns userId → Set<dateStr> of days the user was on
 * leave. DingTalk returns each leave record with start/end timestamps; we
 * expand it to the per-day set covering the queried range.
 *
 * Throws on DingTalk API failure.
 */
export async function fetchLeaveStatus(
  accessToken: string,
  userids: string[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>()
  if (userids.length === 0) return result

  const { startMs, endMs } = dayBounds(fromDate)
  const { endMs: rangeEndMs } = dayBounds(toDate)

  // getleavestatus limits size to max 20 per call
  const BATCH = 20
  for (let i = 0; i < userids.length; i += BATCH) {
    const batch = userids.slice(i, i + BATCH).join(',')
    let offset = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(`${LEAVE_STATUS_URL}?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userid_list: batch, start_time: startMs, end_time: rangeEndMs, offset, size: BATCH }),
        cache: 'no-store',
      })
      if (!res.ok) {
        throw new Error(`getleavestatus HTTP ${res.status} for batch starting at ${i}`)
      }
      const data = (await res.json()) as {
        errcode?: number
        errmsg?: string
        result?: {
          leave_status?: Array<{
            userid?: string
            start_time?: number
            end_time?: number
          }>
          has_more?: boolean
        }
      }
      if (data.errcode) {
        throw new Error(`getleavestatus error ${data.errcode}: ${data.errmsg}`)
      }
      for (const ls of data.result?.leave_status ?? []) {
        if (!ls.userid) continue
        // Expand [start_time, end_time] into per-day keys by enumerating the
        // Shanghai CALENDAR days the interval touches, intersected with the
        // queried range (Codex P2: a <24h leave crossing midnight, e.g. Jul20
        // 18:00 → Jul21 09:00, must mark BOTH days — stepping by 24h from the
        // exact start timestamp would only emit Jul20 and skip Jul21).
        const lsStart = ls.start_time ?? startMs
        const lsEnd = ls.end_time ?? endMs
        const startDay = shanghaiDateStr(lsStart)
        const endDay = shanghaiDateStr(lsEnd)
        let set = result.get(ls.userid)
        if (!set) {
          set = new Set()
          result.set(ls.userid, set)
        }
        for (const d of dateRangeDays(startDay, endDay)) {
          // Only record days that overlap the queried range (the leave may
          // extend beyond it).
          const b = dayBounds(d)
          if (b.endMs < startMs || b.startMs > rangeEndMs) continue
          set.add(d)
        }
      }
      if (!data.result?.has_more) break
      offset += BATCH
    }
  }
  return result
}

const PROCESS_DETAIL_URL = 'https://oapi.dingtalk.com/topapi/processinstance/get'

// ── trip instance detail cache ─────────────────────────
// A COMPLETED+agree trip approval's date range doesn't change, so re-fetching
// its detail on every sync is pure waste (DingTalk bills per call). Cache the
// parsed { tripStart, tripEnd, reason } keyed by instanceId. Entries expire
// after their trip end (they can't be "active today" once past) — lazily, on
// the next sync. Survives across syncs within a process.
interface TripCacheEntry {
  tripStart: number
  tripEnd: number
  reason?: string
  // Whether this instance was COMPLETED+agree with a parseable date range.
  // false ⇒ the instance exists but isn't a usable trip record (don't refetch
  // to re-parse; it won't change).
  parsed: boolean
}
const tripDetailCache = new Map<string, TripCacheEntry>()
// instanceId → originator userid (needed to attribute a trip to a person after
// caching, since the cached window doesn't carry the userid).
const tripOriginator = new Map<string, string>()

/** Drop cache entries whose trip window has fully passed (can't be active). */
function pruneTripCache(now: number) {
  for (const [id, e] of tripDetailCache) {
    if (e.parsed && e.tripEnd < now - 24 * 60 * 60 * 1000) tripDetailCache.delete(id)
  }
}

/**
 * Fetch + parse a trip instance detail, using the cache when available.
 * Returns the parsed trip window (or null for non-COMPLETED/agree/unparseable
 * instances, caching that decision so we don't refetch). The caller tests a
 * specific day against the returned window.
 */
async function getTripDetail(
  accessToken: string,
  instanceId: string,
): Promise<{ tripStart: number; tripEnd: number; reason?: string } | null> {
  const cached = tripDetailCache.get(instanceId)
  if (cached) {
    if (!cached.parsed) return null
    return { tripStart: cached.tripStart, tripEnd: cached.tripEnd, reason: cached.reason }
  }
  const detailRes = await fetch(`${PROCESS_DETAIL_URL}?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ process_instance_id: instanceId }),
    cache: 'no-store',
  })
  if (!detailRes.ok) return null
  const detailData = (await detailRes.json()) as {
    process_instance?: {
      status?: string
      result?: string
      originator_userid?: string
      form_component_values?: Array<{ name?: string; value?: string }>
    }
  }
  const inst = detailData.process_instance
  if (!inst) return null
  // RUNNING/PENDING approvals are still mutable — they may flip to COMPLETED+
  // agree later and start counting as a trip. Do NOT cache them; refetch next
  // sync so we pick up the transition. Only cache the parsed:false sentinel
  // for TERMINAL non-trip instances (COMPLETED but not agreed, or agreed but
  // with no parseable date range) — those won't change.
  if (inst.status !== 'COMPLETED' || inst.result !== 'agree') {
    return null
  }
  // Record the originator so a cached trip can be attributed to a person.
  if (inst.originator_userid) tripOriginator.set(instanceId, inst.originator_userid)
  const parsed = parseTripWindow(inst.form_component_values ?? [])
  if (parsed.tripStart === null || parsed.tripEnd === null) {
    // Terminal (COMPLETED+agree) but unparseable dates → safe to cache as not-a-trip.
    tripDetailCache.set(instanceId, { tripStart: 0, tripEnd: 0, parsed: false })
    return null
  }
  tripDetailCache.set(instanceId, {
    tripStart: parsed.tripStart,
    tripEnd: parsed.tripEnd,
    reason: parsed.reason,
    parsed: true,
  })
  return { tripStart: parsed.tripStart, tripEnd: parsed.tripEnd, reason: parsed.reason }
}

/**
 * Extract { tripStart, tripEnd, reason } from a trip form. Refactored out of
 * checkTripToday to separate "parse the form" from "is today in range", so the
 * parsed window can be cached independently of the current day.
 */
export function parseTripWindow(formValues: unknown[]): { tripStart: number | null; tripEnd: number | null; reason?: string } {
  let tripStart: number | null = null
  let tripEnd: number | null = null
  let reason: string | undefined

  for (const fv of formValues) {
    const f = fv as { name?: string; value?: string }
    if (!f.value) continue

    // Format 1: 京内 — 开始时间/结束时间 field
    if (f.name && f.name.includes('开始时间') && f.name.includes('结束时间')) {
      try {
        const arr = JSON.parse(f.value)
        if (Array.isArray(arr) && arr.length >= 2) {
          tripStart = new Date(String(arr[0]).replace(' ', 'T') + '+08:00').getTime()
          tripEnd = new Date(String(arr[1]).replace(' ', 'T') + '+08:00').getTime()
        }
      } catch { /* not JSON */ }
    }

    // Format 2: 京外 — 商旅出差 JSON with itinerary table
    try {
      const parsed = JSON.parse(f.value)
      if (!Array.isArray(parsed)) continue
      for (const item of parsed) {
        const bizAlias = item.props?.bizAlias || ''
        if (bizAlias === 'reason' && item.value) {
          reason = String(item.value)
        }
        if (bizAlias === 'itinerary') {
          const rows = typeof item.value === 'string' ? JSON.parse(item.value) : item.value
          if (Array.isArray(rows)) {
            for (const row of rows) {
              for (const cell of (row.rowValue || [])) {
                const cAlias = cell.bizAlias || ''
                const cVal = cell.value || ''
                if (cAlias === 'startTime' && cVal) {
                  const ts = new Date(cVal.replace(' ', 'T') + '+08:00').getTime()
                  if (tripStart === null || ts < tripStart) tripStart = ts
                }
                if (cAlias === 'endTime' && cVal) {
                  const ts = new Date(cVal.replace(' ', 'T') + '+08:00').getTime()
                  if (tripEnd === null || ts > tripEnd) tripEnd = ts
                }
              }
            }
          }
        }
      }
    } catch { /* not JSON */ }
  }

  // 京内 外出事由 reason field
  for (const fv of formValues) {
    const f = fv as { name?: string; value?: string }
    if (f.name === '外出事由' && f.value) {
      reason = String(f.value)
    }
  }

  return { tripStart, tripEnd, reason }
}

/**
 * Fetch business-trip status over the queried date range. Returns
 * userid → { days: Set<dateStr>, reason } for every day each person was on a
 * trip (a trip spanning Mon–Wed marks all three days). The reason is the most
 * recently-seen active trip's reason, used for today's Person.avatar display.
 *
 * Cost optimization vs. the previous per-userid loop:
 *  - `listids` is called ONCE per processCode (without userid) instead of
 *    once per user (90 users → 1 call). DingTalk's listids returns all
 *    in-scope instances for a process code; we filter by originator_userid
 *    against the synced set afterward.
 *  - Each instance's detail is fetched once and CACHED (a COMPLETED trip's
 *    date range doesn't change), so steady-state syncs skip the `get` calls.
 *
 * The listids query window is fixed at [now-30d, now] (trips don't matter
 * past 30 days for our finalize-3-day window), but the per-day attribution
 * tests the parsed window against each day in `queryDays`.
 *
 * Throws on DingTalk API failure.
 */
export interface TripStatus {
  days: Set<string>
  reason?: string
}
export async function fetchTripStatus(
  accessToken: string,
  userids: string[],
  queryDays: string[],
): Promise<Map<string, TripStatus>> {
  const result = new Map<string, TripStatus>()
  if (userids.length === 0 || queryDays.length === 0) return result

  const rawCodes = process.env.DINGTALK_TRIP_PROCESS_CODE
  if (!rawCodes) return result
  const processCodes = rawCodes.split(',').map(s => s.trim()).filter(Boolean)
  if (processCodes.length === 0) return result

  const useridSet = new Set(userids)
  const now = Date.now()
  pruneTripCache(now)

  const endTime = now
  const startTime = endTime - 30 * 24 * 60 * 60 * 1000

  // Pre-compute day bounds for each queried day.
  const dayBoundsList = queryDays.map(d => ({ day: d, ...dayBounds(d) }))

  // listids accepts userid_list (comma-separated, batch) and paginates with
  // cursor + size (size max 20). userid_list has a small cap (40032 above ~10),
  // so batch conservatively. Cuts listids calls from N-users to N/batch
  // (was 90 calls for 90 users → 9 batches of 10).
  const USER_BATCH = 10
  for (const processCode of processCodes) {
    for (let i = 0; i < userids.length; i += USER_BATCH) {
      const batch = userids.slice(i, i + USER_BATCH).join(',')
      let cursor = 0
      let hasMore = true
      // eslint-disable-next-line no-constant-condition
      while (hasMore) {
        const listRes = await fetch(`${PROCESS_INSTANCE_URL}?access_token=${accessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            process_code: processCode,
            start_time: startTime,
            end_time: endTime,
            userid_list: batch,
            cursor,
            size: 20,
          }),
          cache: 'no-store',
        })
        if (!listRes.ok) throw new Error(`processinstance/listids HTTP ${listRes.status} for ${processCode}`)
        const listData = (await listRes.json()) as {
          errcode?: number
          errmsg?: string
          result?: { list?: string[]; next_cursor?: number }
        }
        if (listData.errcode) throw new Error(`processinstance/listids error ${listData.errcode}: ${listData.errmsg}`)
        const instanceIds = listData.result?.list ?? []

        for (const instanceId of instanceIds) {
          const detail = await getTripDetail(accessToken, instanceId)
          if (!detail) continue
          // Attribute the trip to its originator (recorded in the cache on
          // first fetch); only keep synced users.
          const owner = tripOriginator.get(instanceId)
          if (!owner || !useridSet.has(owner)) continue
          // For each queried day, mark it if it falls inside [tripStart, tripEnd].
          let entry = result.get(owner)
          if (!entry) {
            entry = { days: new Set() }
            result.set(owner, entry)
          }
          let markedAny = false
          for (const db of dayBoundsList) {
            if (db.startMs <= detail.tripEnd && db.endMs >= detail.tripStart) {
              entry.days.add(db.day)
              markedAny = true
            }
          }
          // Keep the reason of the most recently active trip (later iterations
          // overwrite; fine since a person rarely has 2 concurrent trips).
          if (markedAny) entry.reason = detail.reason
        }

        const next = listData.result?.next_cursor
        if (next === undefined || next === null || next === 0) {
          hasMore = false
        } else {
          cursor = next
        }
      }
    }
  }
  return result
}

/**
 * Map attendance data for a single day to Person.status using the priority:
 * trip > leave > attendance punch > absent.
 *
 * "Punched in" = any OnDuty record exists (Normal, Late, Early, SeriousLate).
 * Only NotSigned / Absenteeism / no record at all → absent.
 *
 * Also returns the day's OnDuty/OffDuty punches so the caller can persist them.
 */
export function mapStatusForDay(
  userid: string,
  day: string,
  tripByDay: Map<string, TripStatus>,
  leaveByDay: Map<string, Set<string>>,
  attByDay: Map<string, Map<string, DayAttendance>>,
): { status: AttendanceResult; onDuty?: DayPunch; offDuty?: DayPunch } {
  // Resolve the day's punches FIRST, so they're preserved even when a
  // higher-priority status wins (Codex P2: someone who punches during a
  // partial-day leave/trip still has real attendance data that must be
  // stored, otherwise the per-person punch history and work-minute display
  // silently lose it).
  const dayAtt = attByDay.get(userid)?.get(day)
  const punches = { onDuty: dayAtt?.onDuty, offDuty: dayAtt?.offDuty }
  if (tripByDay.get(userid)?.days.has(day)) return { status: 'trip', ...punches }
  if (leaveByDay.get(userid)?.has(day)) return { status: 'leave', ...punches }
  if (dayAtt?.onDuty && dayAtt.onDuty.timeResult !== 'NotSigned' && dayAtt.onDuty.timeResult !== 'Absenteeism') {
    return { status: 'present', ...punches }
  }
  // Absent, but still surface any OffDuty punch we have (rare, but for record).
  return { status: 'absent', ...punches }
}

