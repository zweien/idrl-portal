import { describe, it, expect, vi, beforeEach } from 'vitest'

// syncMembers 的部门字段：钉钉侧解析出部门名 → Person.department；
// 空部门不覆盖手动编辑的值（与 title 同一套模式）。

const makeDb = ({ existing }: { existing?: Record<string, unknown> | null }) => {
  const create = vi.fn(async () => ({}))
  const update = vi.fn(async () => ({}))
  const tx = {
    person: {
      findFirst: vi.fn(async () => existing ?? null),
      create,
      update,
    },
    user: {
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
      count: vi.fn(async () => 0),
    },
    attendanceRecord: { upsert: vi.fn(async () => ({})) },
    setting: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
  }
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') await arg(tx)
      else await Promise.all(arg as Promise<unknown>[])
    }),
  }
  return { prisma, create, update }
}

const mockAdmin = (members: Array<Record<string, unknown>>) => {
  vi.doMock('@/lib/dingtalk-admin', () => ({
    getEnterpriseAccessToken: vi.fn(async () => 'fake-token'),
    listDeptMembers: vi.fn(async () => members),
    fetchAttendance: vi.fn(async () => new Map()),
    fetchLeaveStatus: vi.fn(async () => new Map()),
    fetchTripStatus: vi.fn(async () => new Map()),
    mapStatusForDay: vi.fn(() => ({ status: 'absent' as const, onDuty: null, offDuty: null })),
    getDingtalkCallCount: vi.fn(() => 0),
    resetDingtalkCallCount: vi.fn(),
  }))
}

const mockDb = (prisma: unknown) => {
  vi.doMock('@/lib/db', () => ({ prisma }))
}

async function load() {
  return import('@/lib/dingtalk-sync')
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('syncMembers department field', () => {
  it('creates a new person with the resolved department name', async () => {
    const db = makeDb({ existing: null })
    mockDb(db.prisma)
    mockAdmin([
      { userid: 'u1', unionid: 'uni1', name: '陈思', title: '研究员', department: '应用组', deptIdList: [7] },
    ])
    const { syncMembers } = await load()
    const res = await syncMembers()
    expect(res.created).toBe(1)
    expect(db.create).toHaveBeenCalledTimes(1)
    expect(db.create.mock.calls[0][0].data.department).toBe('应用组')
  })

  it('overwrites the department on re-sync when DingTalk provides one', async () => {
    const db = makeDb({ existing: { id: 'dt-u1', name: '陈思', role: '研究员', department: '旧部门' } })
    mockDb(db.prisma)
    mockAdmin([
      { userid: 'u1', unionid: 'uni1', name: '陈思', title: '研究员', department: '新部门', deptIdList: [7] },
    ])
    const { syncMembers } = await load()
    await syncMembers()
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(db.update.mock.calls[0][0].data.department).toBe('新部门')
  })

  it('does not wipe a manually-set department when DingTalk gives none', async () => {
    const db = makeDb({ existing: { id: 'dt-u1', name: '陈思', role: '研究员', department: '手填部门' } })
    mockDb(db.prisma)
    mockAdmin([
      // 无 department 字段（如直接挂在 root 下解析不到名字）
      { userid: 'u1', unionid: 'uni1', name: '陈思', title: '研究员', deptIdList: [1] },
    ])
    const { syncMembers } = await load()
    await syncMembers()
    expect(db.update).toHaveBeenCalledTimes(1)
    expect('department' in db.update.mock.calls[0][0].data).toBe(false)
  })

  it('creates department-less members with an empty department string', async () => {
    const db = makeDb({ existing: null })
    mockDb(db.prisma)
    mockAdmin([
      { userid: 'u1', unionid: 'uni1', name: '张教授', title: '教授', deptIdList: [1] },
    ])
    const { syncMembers } = await load()
    await syncMembers()
    expect(db.create.mock.calls[0][0].data.department).toBe('')
  })
})
