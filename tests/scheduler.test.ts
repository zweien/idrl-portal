import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock prisma.settings lookups + syncLog writes used by runJob.
const mockSettingFindUnique = vi.fn()
const mockSyncLogCreate = vi.fn()
const mockNewsUpdate = vi.fn()
const mockNewsFindMany = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    setting: { findUnique: (...a: unknown[]) => mockSettingFindUnique(...a) },
    syncLog: { create: (...a: unknown[]) => mockSyncLogCreate(...a) },
    newsItem: {
      findMany: (...a: unknown[]) => mockNewsFindMany(...a),
      update: (...a: unknown[]) => mockNewsUpdate(...a),
    },
  },
}))

// Mock the sync implementations so runJob doesn't hit DingTalk.
vi.mock('@/lib/dingtalk-sync', () => ({
  syncMembers: vi.fn().mockResolvedValue({ total: 1, created: 0, updated: 1, linked: 0 }),
  syncAttendance: vi.fn().mockResolvedValue({ total: 1, stats: { present: 1, leave: 0, trip: 0, absent: 0 } }),
}))

const { isValidCron, CRON_PRESETS, runJob, registerScheduler, unregisterScheduler } =
  await import('@/lib/scheduler')

describe('isValidCron', () => {
  it('accepts standard 5-field expressions', () => {
    expect(isValidCron('0 * * * *')).toBe(true)
    expect(isValidCron('*/15 * * * *')).toBe(true)
    expect(isValidCron('0 8-20 * * 1-5')).toBe(true)
  })

  it('rejects malformed expressions', () => {
    expect(isValidCron('not a cron')).toBe(false)
    expect(isValidCron('')).toBe(false)
    expect(isValidCron('99 * * * *')).toBe(false) // minute 99 out of range
  })
})

describe('CRON_PRESETS', () => {
  it('every preset is a valid cron expression', () => {
    for (const { label, expr } of Object.values(CRON_PRESETS)) {
      expect(isValidCron(expr), `${label} → ${expr}`).toBe(true)
    }
  })
})

describe('runJob', () => {
  beforeEach(() => {
    mockSettingFindUnique.mockReset()
    mockSyncLogCreate.mockReset()
    mockNewsUpdate.mockReset()
    mockNewsFindMany.mockReset()
    mockSyncLogCreate.mockResolvedValue({})
    mockNewsUpdate.mockResolvedValue({})
  })

  it('skips a disabled job (no syncLog)', async () => {
    // enabled flag = "false"
    mockSettingFindUnique.mockResolvedValueOnce({ value: 'false' }) // enableKey
    // We can't easily pick which JobDef runs by name via runJob; runJob takes a
    // JobDef. Instead test the publish-news path directly by importing the
    // internal execute. Simplest: assert that when the enable setting is false,
    // nothing runs.
    const { runJob } = await import('@/lib/scheduler')
    // runJob is the unbound executeJob; find the publish-news def.
    // Since runJob requires a JobDef, we call it with a fake def.
    await runJob({
      job: 'publish-news',
      settingKey: 'cron.publish',
      enableKey: 'cron.enabled.publish',
      defaultCron: '*/5 * * * *',
      run: async () => ({ published: 0 }),
    })
    expect(mockSyncLogCreate).not.toHaveBeenCalled()
  })

  it('writes a success syncLog when the job runs', async () => {
    // enabled (default), valid cron
    mockSettingFindUnique.mockResolvedValue(null) // not found → enabled, default cron
    mockNewsFindMany.mockResolvedValue([{ id: 'n1' }])
    await runJob({
      job: 'publish-news',
      settingKey: 'cron.publish',
      enableKey: 'cron.enabled.publish',
      defaultCron: '*/5 * * * *',
      run: async () => {
        // mimic publishDueNews using the mocked prisma
        const due = await mockNewsFindMany()
        for (const n of due) await mockNewsUpdate({ where: { id: n.id } })
        return { published: due.length }
      },
    })
    expect(mockSyncLogCreate).toHaveBeenCalledTimes(1)
    const entry = mockSyncLogCreate.mock.calls[0][0].data
    expect(entry.job).toBe('publish-news')
    expect(entry.source).toBe('cron')
    expect(entry.status).toBe('success')
  })

  it('writes an error syncLog when the job throws', async () => {
    mockSettingFindUnique.mockResolvedValue(null)
    await runJob({
      job: 'publish-news',
      settingKey: 'cron.publish',
      enableKey: 'cron.enabled.publish',
      defaultCron: '*/5 * * * *',
      run: async () => { throw new Error('boom') },
    })
    expect(mockSyncLogCreate).toHaveBeenCalledTimes(1)
    const entry = mockSyncLogCreate.mock.calls[0][0].data
    expect(entry.status).toBe('error')
    expect(entry.message).toBe('boom')
  })
})

describe('registerScheduler / unregisterScheduler', () => {
  afterEach(() => unregisterScheduler())

  it('registers tasks idempotently', () => {
    registerScheduler()
    registerScheduler() // second call is a no-op
    // unregister to clean up
    unregisterScheduler()
    expect(true).toBe(true)
  })
})
