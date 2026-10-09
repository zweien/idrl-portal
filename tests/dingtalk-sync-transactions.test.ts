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
const txUsed = vi.fn()

const makeTxClient = () => ({
  person: {
    findFirst: vi.fn(async () => null),
    update: vi.fn(async () => { if (inTransaction) writeCalls.push('person.update'); return {} }),
    create: vi.fn(async () => { if (inTransaction) writeCalls.push('person.create'); return {} }),
  },
  user: {
    findMany: vi.fn(async () => []),
    update: vi.fn(async () => { if (inTransaction) writeCalls.push('user.update'); return {} }),
    count: vi.fn(async () => 0),
  },
  attendanceRecord: {
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
  mapStatusForDay: vi.fn(() => ({ status: 'absent' as const, onDuty: null, offDuty: null })),
  getDingtalkCallCount: vi.fn(() => 0),
  resetDingtalkCallCount: vi.fn(),
}))

const { syncMembers, syncAttendance, backfillDay } = await import('@/lib/dingtalk-sync')

beforeEach(() => {
  inTransaction = false
  writeCalls.length = 0
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
