import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * syncMembers departure detection: members absent from the configured
 * subtree are classified by whether their unionid still exists anywhere in
 * the org — offboarded (gone entirely) vs transferred (outside the subtree).
 */

const subtreeMembers = [
  { userid: 'u1', unionid: 'uni-1', name: '在子树', title: '', email: null, mobile: null },
  { userid: 'u2', unionid: 'uni-2', name: '也在子树', title: '', email: null, mobile: null },
]
const orgMembers = [
  ...subtreeMembers,
  { userid: 'u3', unionid: 'uni-3', name: '调离者', title: '', email: null, mobile: null },
  // uni-4 (离职者) 不在全组织名单
]

const dbPersons = [
  { id: 'dt-u1', name: '在子树', dingUserId: 'uni-1' },
  { id: 'dt-u3', name: '调离者', dingUserId: 'uni-3' },
  { id: 'dt-u4', name: '离职者', dingUserId: 'uni-4' },
  { id: 'dt-u5', name: '无unionid', dingUserId: null },
]

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        person: {
          findFirst: async () => null,
          findUnique: async () => null,
          update: async () => ({}),
          create: async () => ({}),
        },
        user: { findMany: async () => [] },
        $executeRaw: async () => 0,
      }),
    person: {
      findMany: async ({ where }: { where?: { id?: { startsWith?: string } } } = {}) =>
        where?.id?.startsWith === 'dt-' ? dbPersons : [],
    },
  },
}))

const listDeptMembers = vi.fn(async (_root?: number) => (_root === 1 ? orgMembers : subtreeMembers))
vi.mock('@/lib/dingtalk-admin', () => ({
  resetDingtalkCallCount: vi.fn(),
  getDingtalkCallCount: vi.fn(() => 0),
  listDeptMembers: (root?: number) => listDeptMembers(root),
}))

const { syncMembers } = await import('@/lib/dingtalk-sync')

beforeEach(() => {
  listDeptMembers.mockClear()
})

describe('syncMembers departure detection', () => {
  it('classifies gone-from-org as offboarded and outside-subtree as transferred', async () => {
    const r = await syncMembers()
    expect(r.offboarded).toEqual([{ id: 'dt-u4', name: '离职者' }])
    expect(r.transferred).toEqual([{ id: 'dt-u3', name: '调离者' }])
    // Both pulls happened: the synced subtree and the whole org (root=1).
    expect(listDeptMembers).toHaveBeenCalledWith(undefined)
    expect(listDeptMembers).toHaveBeenCalledWith(1)
  })

  it('never reports rows without a unionid (non-DingTalk persons)', async () => {
    const r = await syncMembers()
    expect(r.offboarded.some(m => m.name === '无unionid')).toBe(false)
    expect(r.transferred.some(m => m.name === '无unionid')).toBe(false)
  })
})
