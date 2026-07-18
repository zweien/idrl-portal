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

// NOTE: Person.role is now free-text and stores the DingTalk 职位 verbatim
// (see lib/dingtalk-sync.ts). The old titleToRole() enum mapping was removed —
// it collapsed real titles (研究员/工程师/访问学者) to a fixed 6-value enum and
// lost information.

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
export interface AttendanceDetail {
  timeResult: string
  checkTime?: string // ISO string of the OnDuty punch
}

export async function fetchAttendance(
  accessToken: string,
  userids: string[],
): Promise<Map<string, AttendanceDetail>> {
  const result = new Map<string, AttendanceDetail>()
  if (userids.length === 0) return result

  const { dateStr } = todayInShanghai()
  const workDateFrom = `${dateStr} 00:00:00`
  const workDateTo = `${dateStr} 23:59:59`

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
        if (uid && checkType === 'OnDuty' && timeResult) {
          const userCheckTime = r.userCheckTime as number | undefined
          const checkTime = userCheckTime
            ? new Date(userCheckTime).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })
            : undefined
          result.set(String(uid), { timeResult: String(timeResult), checkTime })
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

const PROCESS_DETAIL_URL = 'https://oapi.dingtalk.com/topapi/processinstance/get'

/**
 * Check if today falls within a trip approval's date range, and extract the reason.
 * Returns { active: boolean, reason?: string }.
 */
function checkTripToday(formValues: unknown[]): { active: boolean; reason?: string } {
  const today = todayInShanghai()
  const todayStart = today.startMs
  const todayEnd = today.endMs

  let tripStart: number | null = null
  let tripEnd: number | null = null
  let reason: string | undefined

  for (const fv of formValues) {
    const f = fv as { name?: string; value?: string }
    if (!f.value) continue

    // Format 1: 京内 — field name contains 开始时间/结束时间
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
        // Extract reason
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

  // Also check for 外出事由 field (京内)
  for (const fv of formValues) {
    const f = fv as { name?: string; value?: string }
    if (f.name === '外出事由' && f.value) {
      reason = String(f.value)
    }
  }

  if (tripStart !== null && tripEnd !== null) {
    return { active: tripStart <= todayEnd && tripEnd >= todayStart, reason }
  }
  return { active: false }
}

/**
 * Fetch today's business-trip status for a batch of userids.
 * Queries trip approval instances (past 30 days), fetches each instance's
 * detail, and checks if today falls within the trip's date range.
 * Only COMPLETED + agree instances with dates covering today count.
 *
 * Throws on DingTalk API failure.
 */
export async function fetchTripStatus(
  accessToken: string,
  userids: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>() // userid → reason
  if (userids.length === 0) return result

  const rawCodes = process.env.DINGTALK_TRIP_PROCESS_CODE
  if (!rawCodes) return result
  const processCodes = rawCodes.split(',').map(s => s.trim()).filter(Boolean)

  const endTime = Date.now()
  const startTime = endTime - 30 * 24 * 60 * 60 * 1000

  for (const userid of userids) {
    if (result.has(userid)) continue
    for (const processCode of processCodes) {
      const listRes = await fetch(`${PROCESS_INSTANCE_URL}?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ process_code: processCode, start_time: startTime, end_time: endTime, userid }),
        cache: 'no-store',
      })
      if (!listRes.ok) throw new Error(`processinstance/listids HTTP ${listRes.status} for ${userid}`)
      const listData = (await listRes.json()) as { errcode?: number; errmsg?: string; result?: { list?: string[] } }
      if (listData.errcode) throw new Error(`processinstance/listids error ${listData.errcode}: ${listData.errmsg}`)
      const instanceIds = listData.result?.list ?? []

      for (const instanceId of instanceIds) {
        const detailRes = await fetch(`${PROCESS_DETAIL_URL}?access_token=${accessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ process_instance_id: instanceId }),
          cache: 'no-store',
        })
        if (!detailRes.ok) continue
        const detailData = (await detailRes.json()) as {
          process_instance?: {
            status?: string
            result?: string
            originator_userid?: string
            form_component_values?: Array<{ name?: string; value?: string }>
          }
        }
        const inst = detailData.process_instance
        if (!inst) continue
        if (inst.originator_userid !== userid) continue
        if (inst.status !== 'COMPLETED' || inst.result !== 'agree') continue
        const { active, reason } = checkTripToday(inst.form_component_values ?? [])
        if (active) {
          result.set(userid, reason ?? '出差')
          break
        }
      }
      if (result.has(userid)) break
    }
  }
  return result
}

/**
 * Map attendance data to Person.status using the priority:
 * trip > leave > attendance punch > absent.
 *
 * "Punched in" = any OnDuty record exists (Normal, Late, Early, SeriousLate).
 * Only NotSigned / Absenteeism / no record at all → absent.
 */
export function mapStatus(
  userid: string,
  tripMap: Map<string, string>,
  leaveSet: Set<string>,
  attendanceMap: Map<string, AttendanceDetail>,
): AttendanceResult {
  if (tripMap.has(userid)) return 'trip'
  if (leaveSet.has(userid)) return 'leave'
  const att = attendanceMap.get(userid)
  if (att && att.timeResult !== 'NotSigned' && att.timeResult !== 'Absenteeism') {
    return 'present'
  }
  return 'absent'
}

