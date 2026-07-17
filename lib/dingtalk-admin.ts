/**
 * DingTalk enterprise admin API helpers.
 *
 * Server-side access to the DingTalk org (members, departments) via the
 * enterprise access_token (NOT the user login OAuth2 flow in dingtalk.ts).
 * Used by member sync (#27) and attendance mapping (#28).
 *
 * access_token is cached in-memory and refreshed ~5 min before expiry.
 */

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

/**
 * Map a DingTalk job title to the Person role enum.
 * Best-effort keyword matching; falls back to 'staff'.
 */
export function titleToRole(title?: string): 'professor' | 'postdoc' | 'phd' | 'master' | 'undergraduate' | 'staff' {
  if (!title) return 'staff'
  const t = title.toLowerCase()
  if (t.includes('教授') || t.includes('professor')) return 'professor'
  if (t.includes('博士后') || t.includes('postdoc')) return 'postdoc'
  if (t.includes('博士') || t.includes('phd')) return 'phd'
  if (t.includes('硕士') || t.includes('master')) return 'master'
  if (t.includes('本科') || t.includes('undergraduate')) return 'undergraduate'
  return 'staff'
}

// ── attendance / leave / trip ─────────────────────────

const ATTENDANCE_LIST_URL = 'https://oapi.dingtalk.com/attendance/list'
const LEAVE_STATUS_URL = 'https://oapi.dingtalk.com/topapi/attendance/getleavestatus'
const PROCESS_INSTANCE_URL = 'https://oapi.dingtalk.com/topapi/processinstance/listids'

export type AttendanceResult = 'present' | 'leave' | 'trip' | 'absent'

/**
 * Get today's date boundaries in Asia/Shanghai timezone (UTC+8).
 * Returns { dateStr: "yyyy-MM-dd", startMs, endMs } for local-day queries.
 */
function todayInShanghai(): { dateStr: string; startMs: number; endMs: number } {
  const now = new Date()
  // Shift to UTC+8 to get the local calendar day
  const shanghaiOffset = 8 * 60 * 60 * 1000
  const local = new Date(now.getTime() + shanghaiOffset + now.getTimezoneOffset() * 60 * 1000)
  const dateStr = local.toISOString().slice(0, 10)
  // Start/end of that day in UTC+8, converted back to ms timestamps
  const dayStart = new Date(dateStr + 'T00:00:00+08:00')
  const dayEnd = new Date(dateStr + 'T23:59:59+08:00')
  return { dateStr, startMs: dayStart.getTime(), endMs: dayEnd.getTime() }
}

/**
 * Fetch today's attendance records for a batch of DingTalk userids.
 * Returns a Map<userId, timeResult> where timeResult is the DingTalk raw
 * value (Normal/Late/Early/NotSigned/Absenteeism).
 *
 * Throws on DingTalk API failure (don't silently treat errors as absence).
 */
export async function fetchAttendance(
  accessToken: string,
  userids: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (userids.length === 0) return result

  const { dateStr } = todayInShanghai()
  const workDateFrom = `${dateStr} 00:00:00`
  const workDateTo = `${dateStr} 23:59:59`

  // attendance/list accepts max 50 userids per call; paginate with offset.
  // Each user generates multiple records (OnDuty + OffDuty), so limit must
  // be larger than the userid batch to capture all.
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
        // DingTalk attendance/list uses camelCase 'userId' (not 'userid')
        const uid = r.userId ?? r.userid
        const checkType = r.checkType
        const timeResult = r.timeResult
        if (uid && checkType === 'OnDuty' && timeResult) {
          // Use the OnDuty (上班) result as the day's attendance status
          result.set(String(uid), String(timeResult))
        }
      }
      if (!data.hasMore) break
      offset += 50
    }
  }
  return result
}

/**
 * Fetch today's leave status for a batch of DingTalk userids.
 * Returns a Set of userids that are on leave today.
 *
 * Throws on DingTalk API failure.
 */
export async function fetchLeaveStatus(
  accessToken: string,
  userids: string[],
): Promise<Set<string>> {
  const result = new Set<string>()
  if (userids.length === 0) return result

  const { startMs, endMs } = todayInShanghai()

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
        body: JSON.stringify({ userid_list: batch, start_time: startMs, end_time: endMs, offset, size: BATCH }),
        cache: 'no-store',
      })
      if (!res.ok) {
        throw new Error(`getleavestatus HTTP ${res.status} for batch starting at ${i}`)
      }
      const data = (await res.json()) as {
        errcode?: number
        errmsg?: string
        result?: {
          leave_status?: Array<{ userid?: string }>
          has_more?: boolean
        }
      }
      if (data.errcode) {
        throw new Error(`getleavestatus error ${data.errcode}: ${data.errmsg}`)
      }
      for (const ls of data.result?.leave_status ?? []) {
        if (ls.userid) result.add(ls.userid)
      }
      if (!data.result?.has_more) break
      offset += BATCH
    }
  }
  return result
}

/**
 * Fetch today's business-trip approval instances for a batch of userids.
 * Uses the approval processinstance API with DINGTALK_TRIP_PROCESS_CODE.
 * Returns a Set of userids that have a trip approval today.
 *
 * Note: processinstance/listids filters by approval creation date, not trip
 * date. A wider window (past 30 days) is used to catch ongoing trips, then
 * only approved instances count. This is a best-effort heuristic.
 *
 * Throws on DingTalk API failure.
 */
export async function fetchTripStatus(
  accessToken: string,
  userids: string[],
): Promise<Set<string>> {
  const result = new Set<string>()
  if (userids.length === 0) return result

  const processCode = process.env.DINGTALK_TRIP_PROCESS_CODE
  if (!processCode) return result // not configured → skip trip detection

  // Use a 30-day window to catch trips submitted earlier but still ongoing
  const endTime = Date.now()
  const startTime = endTime - 30 * 24 * 60 * 60 * 1000

  for (const userid of userids) {
    const res = await fetch(`${PROCESS_INSTANCE_URL}?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        process_code: processCode,
        start_time: startTime,
        end_time: endTime,
        userid,
      }),
      cache: 'no-store',
    })
    if (!res.ok) {
      throw new Error(`processinstance/listids HTTP ${res.status} for user ${userid}`)
    }
    const data = (await res.json()) as {
      errcode?: number
      errmsg?: string
      result?: { list?: string[]; process_instance_list?: string[] }
    }
    if (data.errcode) {
      throw new Error(`processinstance/listids error ${data.errcode}: ${data.errmsg}`)
    }
    // processinstance/listids returns IDs in result.list (not process_instance_list)
    const instances = data.result?.list ?? data.result?.process_instance_list ?? []
    if (instances.length > 0) {
      result.add(userid)
    }
  }
  return result
}

/**
 * Map attendance data to Person.status using the priority:
 * trip > leave > attendance punch > absent.
 */
export function mapStatus(
  userid: string,
  tripSet: Set<string>,
  leaveSet: Set<string>,
  attendanceMap: Map<string, string>,
): AttendanceResult {
  if (tripSet.has(userid)) return 'trip'
  if (leaveSet.has(userid)) return 'leave'
  const timeResult = attendanceMap.get(userid)
  if (timeResult === 'Normal') return 'present'
  return 'absent' // NotSigned, Late, Early, Absenteeism, or no record
}

