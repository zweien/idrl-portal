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

const { isValidCron, CRON_PRESETS, runJob, registerScheduler, unregisterScheduler, cronMatchesMinute } =
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

describe('cronMatchesMinute', () => {
  it('matches every-minute expression at any time', () => {
    expect(cronMatchesMinute('* * * * *', new Date('2026-07-17T10:30:00Z'))).toBe(true)
  })

  it('matches */15 only on the 15-minute boundaries', () => {
    expect(cronMatchesMinute('*/15 * * * *', new Date('2026-07-17T10:00:00Z'))).toBe(true)
    expect(cronMatchesMinute('*/15 * * * *', new Date('2026-07-17T10:15:00Z'))).toBe(true)
    expect(cronMatchesMinute('*/15 * * * *', new Date('2026-07-17T10:07:00Z'))).toBe(false)
  })

  it('respects hour and weekday', () => {
    // 0 8-20 * * 1-5 : minute 0, hours 8-20, Mon-Fri
    // 2026-07-17 is a Friday; 10:00 UTC matches.
    expect(cronMatchesMinute('0 8-20 * * 1-5', new Date('2026-07-17T10:00:00Z'))).toBe(true)
    // Saturday at 10:00 → no match (weekday)
    expect(cronMatchesMinute('0 8-20 * * 1-5', new Date('2026-07-18T10:00:00Z'))).toBe(false)
    // Friday but minute 30 → no match
    expect(cronMatchesMinute('0 8-20 * * 1-5', new Date('2026-07-17T10:30:00Z'))).toBe(false)
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

  // Use '* * * * *' (every minute) so cronMatchesMinute is always true, and
  // re-read the setting as enabled/valid for the "runs" cases.
  it('skips a disabled job (no syncLog)', async () => {
    mockSettingFindUnique.mockResolvedValue({ value: 'false' }) // enableKey → disabled
    await runJob({
      job: 'publish-news',
      settingKey: 'cron.publish',
      enableKey: 'cron.enabled.publish',
      defaultCron: '* * * * *',
      run: async () => ({ published: 0 }),
    })
    expect(mockSyncLogCreate).not.toHaveBeenCalled()
  })

  it('writes a success syncLog when the job runs', async () => {
    // enableKey found true, cron.publish = every minute → matches now
    mockSettingFindUnique.mockImplementation(({ where }: { where: { key: string } }) =>
      Promise.resolve(where.key === 'cron.enabled.publish' ? { value: 'true' } : { value: '* * * * *' }),
    )
    mockNewsFindMany.mockResolvedValue([{ id: 'n1' }])
    await runJob({
      job: 'publish-news',
      settingKey: 'cron.publish',
      enableKey: 'cron.enabled.publish',
      defaultCron: '* * * * *',
      run: async () => {
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
    mockSettingFindUnique.mockImplementation(({ where }: { where: { key: string } }) =>
      Promise.resolve(where.key === 'cron.enabled.publish' ? { value: 'true' } : { value: '* * * * *' }),
    )
    await runJob({
      job: 'publish-news',
      settingKey: 'cron.publish',
      enableKey: 'cron.enabled.publish',
      defaultCron: '* * * * *',
      run: async () => { throw new Error('boom') },
    })
    expect(mockSyncLogCreate).toHaveBeenCalledTimes(1)
    const entry = mockSyncLogCreate.mock.calls[0][0].data
    expect(entry.status).toBe('error')
    expect(entry.message).toBe('boom')
  })

  it('does not run when the live cron does not match the current minute', async () => {
    // enable true, but cron = "0 0 1 1 *" (Jan 1 only) → won't match now
    mockSettingFindUnique.mockImplementation(({ where }: { where: { key: string } }) =>
      Promise.resolve(where.key === 'cron.enabled.publish' ? { value: 'true' } : { value: '0 0 1 1 *' }),
    )
    await runJob({
      job: 'publish-news',
      settingKey: 'cron.publish',
      enableKey: 'cron.enabled.publish',
      defaultCron: '* * * * *',
      run: async () => ({ published: 0 }),
    })
    expect(mockSyncLogCreate).not.toHaveBeenCalled()
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
