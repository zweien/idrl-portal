import { describe, it, expect, vi, beforeEach } from 'vitest'

// PATCH /api/personnel/:id 的合并语义回归（codex review P1）：
// 弹窗清空部门后提交的是 department: ''，PATCH 按 {...existing, ...body} 合并，
// 空串必须真的写库，而不是因字段缺席而保留旧值。

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    person: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}))
vi.mock('@/lib/auth-api', () => ({
  requireAdmin: vi.fn(async () => ({ userId: 'admin-1', role: 'admin' })),
}))
vi.mock('@/lib/audit', () => ({
  logAction: vi.fn(async () => {}),
  actorFromAuth: vi.fn(() => ({ actorId: 'admin-1', actorName: 'admin' })),
}))

const { PATCH } = await import('@/app/api/personnel/[id]/route')

const EXISTING = {
  id: 'p1', name: '陈思', role: '研究员', department: '算法组',
  email: null, phone: null, dingUserId: null, status: 'present',
  lastSeen: null, researchAreas: null, avatar: null, offboardedAt: null,
}

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request('http://localhost/api/personnel/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'p1' }) },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindUnique.mockResolvedValue(EXISTING)
  mockUpdate.mockResolvedValue({ ...EXISTING })
})

describe('PATCH /api/personnel/:id department merge', () => {
  it('persists department: "" so an admin can clear the field', async () => {
    const res = await patch({ name: '陈思', role: '研究员', status: 'present', department: '' })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate.mock.calls[0][0].data.department).toBe('')
  })

  it('keeps the existing department when the body omits the field', async () => {
    await patch({ name: '陈思', role: '研究员', status: 'present' })
    expect(mockUpdate.mock.calls[0][0].data.department).toBe('算法组')
  })

  it('persists a new department value', async () => {
    await patch({ name: '陈思', role: '研究员', status: 'present', department: '系统组' })
    expect(mockUpdate.mock.calls[0][0].data.department).toBe('系统组')
  })
})
