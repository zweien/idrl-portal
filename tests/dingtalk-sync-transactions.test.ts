import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Contract tests for the transaction boundaries in lib/dingtalk-sync.
 *
 * syncMembers / syncAttendance / backfillDay wrap their DB-write loops in
 * prisma.$transaction so a mid-sync failure rolls back the partial writes
 * instead of leaving half-applied state. These tests don't reproduce Prisma's
 * rollback semantics (that's Prisma's contract) — they assert the structural
 * invariant: the writes happen INSIDE a $transaction callback, not as
 * auto-committed standalone calls. This guards against a future refactor
 * accidentally moving a loop back outside the tx.
 */

// Track whether writes happened inside a $transaction callback.
let inTransaction = false
const writeCalls: string[] = []
// Captured args of attendanceRecord.update (the 补卡 trip-preservation branch).
const attUpdateArgs: Array<Record<string, unknown> | undefined> = []
// Captured args of person.update (the live pass — today's status/avatar).
const personUpdateArgs: Array<Record<string, unknown> | undefined> = []
const txUsed = vi.fn()

const makeTxClient = () => ({
  person: {
    findFirst: vi.fn(async () => null),
    update: vi.fn(async (args?: Record<string, unknown>) => {
      if (inTransaction) { writeCalls.push('person.update'); personUpdateArgs.push(args) }
      return {}
    }),
    create: vi.fn(async () => { if (inTransaction) writeCalls.push('person.create'); return {} }),
  },
  user: {
    findMany: vi.fn(async () => []),
    update: vi.fn(async () => { if (inTransaction) writeCalls.push('user.update'); return {} }),
    count: vi.fn(async () => 0),
  },
  attendanceRecord: {
    findUnique: vi.fn(async () => null),
    update: vi.fn(async (args?: Record<string, unknown>) => {
      if (inTransaction) { writeCalls.push('attendanceRecord.update'); attUpdateArgs.push(args) }
      return {}
    }),
    upsert: vi.fn(async () => { if (inTransaction) writeCalls.push('attendanceRecord.upsert'); return {} }),
  },
  setting: {
    findUnique: vi.fn(async () => null),
    upsert: vi.fn(async () => { if (inTransaction) writeCalls.push('setting.upsert'); return {} }),
  },
})

const txClient = makeTxClient()

vi.mock('@/lib/db', () => ({
  prisma: {
    ...txClient,
    $transaction: vi.fn(async (arg: unknown) => {
      txUsed()
      // Interactive tx: arg is an async callback receiving the tx client.
      if (typeof arg === 'function') {
        inTransaction = true
        try {
          await arg(txClient)
        } finally {
          inTransaction = false
        }
        return
      }
      // Batch tx (array of promises) — just await all.
      inTransaction = true
      try {
        await Promise.all(arg as Promise<unknown>[])
      } finally {
        inTransaction = false
      }
    }),
  },
}))

// Mock dingtalk-admin network functions to return deterministic data without
// hitting DingTalk. listDeptMembers returns 2 members; fetch* return empty maps.
vi.mock('@/lib/dingtalk-admin', () => ({
  getEnterpriseAccessToken: vi.fn(async () => 'fake-token'),
  listDeptMembers: vi.fn(async () => [
    { userid: 'u1', unionid: 'uni1', name: 'Alice', title: '工程师', email: null, mobile: null },
    { userid: 'u2', unionid: 'uni2', name: 'Bob', title: '', email: null, mobile: null },
  ]),
  fetchAttendance: vi.fn(async () => new Map()),
  fetchLeaveStatus: vi.fn(async () => new Map()),
  fetchTripStatus: vi.fn(async () => new Map()),
  fetchBuKaoApprovals: vi.fn(async () => ({ daysByUser: new Map(), nextSinceMs: 0, seen: 0, approved: 0 })),
  mapStatusForDay: vi.fn(() => ({ status: 'absent' as const, onDuty: null, offDuty: null })),
  getDingtalkCallCount: vi.fn(() => 0),
  resetDingtalkCallCount: vi.fn(),
}))

const { syncMembers, syncAttendance, backfillDay } = await import('@/lib/dingtalk-sync')

beforeEach(() => {
  inTransaction = false
  writeCalls.length = 0
  attUpdateArgs.length = 0
  personUpdateArgs.length = 0
  txUsed.mockClear()
})

describe('syncMembers transaction boundary', () => {
  it('writes all member/user changes inside a single $transaction', async () => {
    const res = await syncMembers()
    expect(txUsed).toHaveBeenCalledTimes(1)
    expect(res.total).toBe(2)
    expect(res.created).toBe(2)
    // Every write happened inside the tx (no auto-committed standalone writes).
    expect(writeCalls.length).toBe(2) // two person.create
    expect(writeCalls.every(c => c === 'person.create' || c === 'person.update' || c === 'user.update')).toBe(true)
  })
})

describe('syncAttendance transaction boundary', () => {
  it('writes records + watermark inside one $transaction', async () => {
    // Two dt- persons exist (seeded by the person.create above in a prior test,
    // but the mock person.findMany below returns them regardless of DB state).
    txClient.person.findFirst = vi.fn(async () => null)
    // Override findMany for the dt-persons lookup: return two dt- persons.
    ;(txClient.person as { findMany?: unknown }).findMany = vi.fn(async () => [
      { id: 'dt-u1' },
      { id: 'dt-u2' },
    ])
    const res = await syncAttendance()
    expect(txUsed).toHaveBeenCalledTimes(1)
    expect(res.total).toBe(2)
    // Writes only occurred inside the tx.
    expect(writeCalls.length).toBeGreaterThan(0)
    expect(writeCalls.some(c => c === 'attendanceRecord.upsert')).toBe(true)
    expect(writeCalls.some(c => c === 'person.update')).toBe(true)
    expect(writeCalls.some(c => c === 'setting.upsert')).toBe(true)
  })

  it('补卡 correction: a frozen trip row keeps its status (punch refresh only)', async () => {
    // fetchTripStatus only lists approvals created in the last 30 days, so the
    // correction pass cannot re-derive trip status for older trips covering a
    // corrected day — re-mapping would downgrade a legitimate trip row to
    // present. The frozen status must be preserved; only punches refresh.
    ;(txClient.person as { findMany?: unknown }).findMany = vi.fn(async () => [{ id: 'dt-u1' }])
    ;(txClient.attendanceRecord as { findUnique?: unknown }).findUnique = vi.fn(async () => ({ status: 'trip' }))
    const { fetchBuKaoApprovals } = await import('@/lib/dingtalk-admin')
    vi.mocked(fetchBuKaoApprovals).mockResolvedValueOnce({
      daysByUser: new Map([['u1', new Set(['2026-10-20'])]]),
      nextSinceMs: 0,
      seen: 1,
      approved: 1,
    })
    const res = await syncAttendance()
    expect(res.bukaoRows).toBe(1)
    expect(writeCalls.some(c => c === 'attendanceRecord.update')).toBe(true)
    // The preservation branch must not carry a status overwrite — inspect the
    // actual Prisma payload (fields ride under `data`, not `update`).
    expect(attUpdateArgs.length).toBe(1)
    const data = attUpdateArgs[0]?.data as Record<string, unknown> | undefined
    expect(data).toBeDefined()
    expect(data && 'status' in data).toBe(false)
    expect('checkIn' in data!).toBe(true)
    expect('checkOut' in data!).toBe(true)
  })

  it('补卡 correction: non-trip rows are fully re-mapped via upsert', async () => {
    ;(txClient.person as { findMany?: unknown }).findMany = vi.fn(async () => [{ id: 'dt-u1' }])
    ;(txClient.attendanceRecord as { findUnique?: unknown }).findUnique = vi.fn(async () => ({ status: 'absent' }))
    const { fetchBuKaoApprovals } = await import('@/lib/dingtalk-admin')
    vi.mocked(fetchBuKaoApprovals).mockResolvedValueOnce({
      daysByUser: new Map([['u1', new Set(['2026-10-20'])]]),
      nextSinceMs: 0,
      seen: 1,
      approved: 1,
    })
    const res = await syncAttendance()
    expect(res.bukaoRows).toBe(1)
    expect(writeCalls.some(c => c === 'attendanceRecord.upsert')).toBe(true)
  })

  it('补卡 correction: today’s Person.avatar reason comes only from the today-scoped trip fetch', async () => {
    // fetchTripStatus returns ONE reason per user, last-write-wins across the
    // queried days. When a sweep covers today AND a historical day, merging
    // that single fetch into the live map would let the historical trip's
    // reason hijack today's Person.avatar — the today fetch must be scoped to
    // [today] so its reason is unambiguously today's.
    const { todayDateStr } = await import('@/lib/attendance')
    const todayStr = todayDateStr()
    const historicalDay = '2020-01-02'
    ;(txClient.person as { findMany?: unknown }).findMany = vi.fn(async () => [{ id: 'dt-u1' }])
    ;(txClient.attendanceRecord as { findUnique?: unknown }).findUnique = vi.fn(async () => ({ status: 'absent' }))
    const { fetchBuKaoApprovals, fetchTripStatus } = await import('@/lib/dingtalk-admin')
    vi.mocked(fetchBuKaoApprovals).mockResolvedValueOnce({
      daysByUser: new Map([['u1', new Set([todayStr, historicalDay])]]),
      nextSinceMs: 0,
      seen: 1,
      approved: 1,
    })
    // Call order inside syncAttendance: main window fetch, historical fetch,
    // today-scoped fetch. Each returns its own trip set, emulating the real
    // per-user last-write-wins reason semantics.
    vi.mocked(fetchTripStatus)
      .mockImplementationOnce(async (_token, _uids, days: string[]) =>
        days.includes(todayStr)
          ? new Map([['u1', { days: new Set([todayStr]), reason: '今日出差' }]])
          : new Map())
      .mockImplementationOnce(async (_token, _uids, days: string[]) =>
        days.includes(historicalDay)
          ? new Map([['u1', { days: new Set([historicalDay]), reason: '历史出差' }]])
          : new Map())
      .mockImplementationOnce(async (_token, _uids, days: string[]) =>
        days.length === 1 && days[0] === todayStr
          ? new Map([['u1', { days: new Set([todayStr]), reason: '今日出差' }]])
          : new Map())
    const res = await syncAttendance()
    expect(res.bukaoRows).toBe(2)
    expect(personUpdateArgs.length).toBe(1)
    // The live pass must carry TODAY's trip reason, not the historical one.
    const liveData = personUpdateArgs[0]?.data as Record<string, unknown> | undefined
    expect(liveData?.avatar).toBe('今日出差')
  })
})

describe('backfillDay transaction boundary', () => {
  it('writes all upserts inside one $transaction', async () => {
    ;(txClient.person as { findMany?: unknown }).findMany = vi.fn(async () => [
      { id: 'dt-u1' },
      { id: 'dt-u2' },
    ])
    const res = await backfillDay('2026-08-01')
    expect(txUsed).toHaveBeenCalledTimes(1)
    expect(res.upserted).toBe(2)
    expect(writeCalls.every(c => c === 'attendanceRecord.upsert')).toBe(true)
    expect(writeCalls.length).toBe(2)
  })
})
