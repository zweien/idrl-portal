import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionData } from '@/lib/session'

// Mock prisma.auditLog so the test doesn't touch the real DB.
const mockCreate = vi.fn()
const mockDeleteMany = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: {
      create: (...a: unknown[]) => mockCreate(...a),
      deleteMany: (...a: unknown[]) => mockDeleteMany(...a),
    },
  },
}))

const { logAction, actorFromAuth, pruneAuditLogs } = await import('@/lib/audit')

beforeEach(() => {
  mockCreate.mockReset()
  mockDeleteMany.mockReset()
  mockCreate.mockResolvedValue({})
  mockDeleteMany.mockResolvedValue({ count: 0 })
})

describe('actorFromAuth', () => {
  it('extracts a real user id', () => {
    const auth: SessionData = { userId: 'u1', provider: 'local', role: 'admin' }
    expect(actorFromAuth(auth)).toEqual({ actorId: 'u1', actorType: 'user' })
  })

  it('extracts an apikey id (strips the apikey: prefix)', () => {
    const auth: SessionData = { userId: 'apikey:k9', provider: 'apikey', role: 'admin' }
    expect(actorFromAuth(auth)).toEqual({ actorId: 'k9', actorType: 'apikey' })
  })

  it('returns a fallback for missing userId', () => {
    const auth: SessionData = { userId: undefined, provider: 'local', role: 'member' }
    const r = actorFromAuth(auth)
    expect(r.actorType).toBe('user')
    expect(r.actorId).toBe('unknown')
  })
})

describe('logAction', () => {
  it('writes a row with all fields', async () => {
    await logAction({
      actorId: 'u1', actorType: 'user',
      action: 'news.create', targetType: 'news', targetId: 'n1',
      summary: '发布动态 测试',
    })
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const data = mockCreate.mock.calls[0][0].data
    expect(data).toMatchObject({
      actorId: 'u1', actorType: 'user',
      action: 'news.create', targetType: 'news', targetId: 'n1',
      summary: '发布动态 测试', status: 'success',
    })
  })

  it('defaults targetId to null and status to success', async () => {
    await logAction({
      actorId: 'u1', actorType: 'user',
      action: 'settings.update', targetType: 'settings',
      summary: '修改 cron',
    })
    const data = mockCreate.mock.calls[0][0].data
    expect(data.targetId).toBeNull()
    expect(data.status).toBe('success')
  })

  it('does NOT throw when prisma fails (fire-and-forget)', async () => {
    mockCreate.mockRejectedValue(new Error('DB down'))
    // Should not throw — just console.error internally.
    await expect(logAction({
      actorId: 'u1', actorType: 'user',
      action: 'news.delete', targetType: 'news', targetId: 'n1',
      summary: '删除',
    })).resolves.toBeUndefined()
  })
})

describe('pruneAuditLogs', () => {
  it('deletes logs older than keepDays', async () => {
    mockDeleteMany.mockResolvedValue({ count: 5 })
    const result = await pruneAuditLogs(90)
    expect(mockDeleteMany).toHaveBeenCalledTimes(1)
    expect(result.deleted).toBe(5)
  })
})
