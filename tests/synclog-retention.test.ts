import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSettingFindUnique = vi.fn()
const mockSyncLogDeleteMany = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    setting: { findUnique: (...a: unknown[]) => mockSettingFindUnique(...a) },
    syncLog: { deleteMany: (...a: unknown[]) => mockSyncLogDeleteMany(...a) },
  },
}))

const { pruneSyncLogs, readSyncKeepDays } = await import('@/lib/scheduler')

beforeEach(() => {
  mockSettingFindUnique.mockReset()
  mockSyncLogDeleteMany.mockReset()
  mockSyncLogDeleteMany.mockResolvedValue({ count: 0 })
})

describe('readSyncKeepDays', () => {
  it('defaults to 30 when no Setting row', async () => {
    mockSettingFindUnique.mockResolvedValue(null)
    expect(await readSyncKeepDays()).toBe(30)
  })
  it('reads the configured value', async () => {
    mockSettingFindUnique.mockResolvedValue({ value: '14' })
    expect(await readSyncKeepDays()).toBe(14)
  })
  it('falls back to 30 for invalid values', async () => {
    mockSettingFindUnique.mockResolvedValue({ value: 'not-a-number' })
    expect(await readSyncKeepDays()).toBe(30)
    mockSettingFindUnique.mockResolvedValue({ value: '-5' })
    expect(await readSyncKeepDays()).toBe(30)
  })
})

describe('pruneSyncLogs', () => {
  it('deletes rows older than keepDays and returns the count', async () => {
    mockSyncLogDeleteMany.mockResolvedValue({ count: 42 })
    const result = await pruneSyncLogs(30)
    expect(result.deleted).toBe(42)
    // The cutoff passed to deleteMany should be ~30 days ago.
    const arg = mockSyncLogDeleteMany.mock.calls[0][0]
    const cutoff = arg.where.createdAt.lt as Date
    const ageDays = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000)
    expect(ageDays).toBeGreaterThan(29)
    expect(ageDays).toBeLessThan(31)
  })
  it('reports 0 when nothing matched', async () => {
    mockSyncLogDeleteMany.mockResolvedValue({ count: 0 })
    expect((await pruneSyncLogs(7)).deleted).toBe(0)
  })
})
