import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// listDeptMembers 的部门名解析：走真实的部门树遍历 + 子树内 deptIdList 匹配。
// 通过 mock 全局 fetch 模拟钉钉 department/listsub 与 user/list 两个端点。

// getEnterpriseAccessToken 需要应用凭证（只读 env，不发起真实请求——token 端点
// 也被下面的 fetch mock 接管）。
process.env.DINGTALK_CLIENT_ID = 'test-key'
process.env.DINGTALK_CLIENT_SECRET = 'test-secret'

const TOKEN = 'fake-token'

let subDepartments: Array<{ dept_id: number; name: string; parent_id: number }> = []
let usersByDept: Record<number, Array<Record<string, unknown>>> = {}
const fetchCalls: Array<{ url: string; body?: unknown }> = []

function json(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  vi.resetModules()
  fetchCalls.length = 0
  // 固定子树：root 100（名字未知）→ 算法组 7、系统组 8 → 7 的子组 9
  subDepartments = [
    { dept_id: 7, name: '算法组', parent_id: 100 },
    { dept_id: 8, name: '系统组', parent_id: 100 },
    { dept_id: 9, name: '算法组-推理', parent_id: 7 },
  ]
  usersByDept = {}
  // stub 放在 beforeEach：afterEach unstub 之后若留在文件顶层会露出真实 fetch，
  // 对钉钉发起真实请求（token 端点返回 400）。
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: { body?: string }) => {
    const u = String(url)
    const body = init?.body ? JSON.parse(init.body) : undefined
    fetchCalls.push({ url: u, body })
    if (u.includes('accessToken')) {
      return json({ expireIn: 7200, accessToken: TOKEN })
    }
    if (u.includes('department/listsub')) {
      return json({ errcode: 0, result: subDepartments.filter(d => d.parent_id === body?.dept_id) })
    }
    if (u.includes('user/list')) {
      return json({ errcode: 0, result: { list: usersByDept[body?.dept_id as number] ?? [], has_more: false } })
    }
    throw new Error('unexpected fetch: ' + u)
  }))
})
afterEach(() => { vi.unstubAllGlobals() })

async function load() {
  return import('@/lib/dingtalk-admin')
}

describe('listDeptMembers department resolution', () => {
  it('resolves the first deptIdList entry inside the synced subtree', async () => {
    const { listDeptMembers } = await load()
    usersByDept = {
      // 成员挂在系统组(8)名下（BFS 先遇到她），但 deptIdList 首位是算法组(7)
      8: [{ userid: 'u1', unionid: 'uni1', name: '陈思', dept_id_list: [7, 8] }],
    }
    const members = await listDeptMembers(100)
    // 部门名按 deptIdList 顺序取子树内第一个 → 算法组（不跟随 BFS 遇到她的顺序）
    expect(members.find(m => m.userid === 'u1')?.department).toBe('算法组')
  })

  it("returns '' for a member directly under the root (root name unknown)", async () => {
    const { listDeptMembers } = await load()
    usersByDept = {
      100: [{ userid: 'u2', unionid: 'uni2', name: '张教授', dept_id_list: [100] }],
    }
    const members = await listDeptMembers(100)
    expect(members.find(m => m.userid === 'u2')?.department).toBe('')
  })

  it("returns '' when deptIdList is missing", async () => {
    const { listDeptMembers } = await load()
    usersByDept = {
      7: [{ userid: 'u3', unionid: 'uni3', name: '李明' }],
    }
    const members = await listDeptMembers(100)
    expect(members.find(m => m.userid === 'u3')?.department).toBe('')
  })

  it('caches the dept tree across calls (department/listsub fetched once)', async () => {
    const { listDeptMembers } = await load()
    usersByDept = { 7: [{ userid: 'u1', unionid: 'uni1', name: '李明', dept_id_list: [7] }] }
    await listDeptMembers(100)
    await listDeptMembers(100)
    // 冷走 BFS 依次 listsub 100、7、8、9（4 次）；第二次命中 TTL 缓存，0 次。
    const listsubCalls = fetchCalls.filter(c => c.url.includes('department/listsub'))
    expect(listsubCalls.length).toBe(4)
  })
})
