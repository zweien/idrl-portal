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
