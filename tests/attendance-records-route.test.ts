import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth + prisma so the route runs without cookies/DB. Follows the
// pattern from tests/auth-api.test.ts.
const mockRequireUserOrScopeAny = vi.fn()
vi.mock('@/lib/auth-api', () => ({
  requireUserOrScopeAny: (...a: unknown[]) => mockRequireUserOrScopeAny(...a),
}))

const mockUserFindUnique = vi.fn()
const mockAttendanceCount = vi.fn()
const mockAttendanceFindMany = vi.fn()
const mockPersonFindUnique = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    person: { findUnique: (...a: unknown[]) => mockPersonFindUnique(...a) },
    attendanceRecord: {
      count: (...a: unknown[]) => mockAttendanceCount(...a),
      findMany: (...a: unknown[]) => mockAttendanceFindMany(...a),
    },
  },
}))

const { GET } = await import('@/app/api/attendance/records/route')

type Session = { userId: string; provider: string; role: 'admin' | 'member' }

function mockSession(session: Session) {
  mockRequireUserOrScopeAny.mockResolvedValue(session)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAttendanceCount.mockResolvedValue(0)
  mockAttendanceFindMany.mockResolvedValue([])
  mockPersonFindUnique.mockResolvedValue({ name: '陈思', department: '算法组' })
})

function callApi(params: string = '') {
  return GET(new Request(`http://localhost/api/attendance/records${params}`))
}

describe('GET /api/attendance/records — person block', () => {
  it('returns the queried person with department for labelling', async () => {
    mockSession({ userId: 'apikey:k1', provider: 'apikey', role: 'admin' })
    mockAttendanceCount.mockResolvedValue(1)
    mockAttendanceFindMany.mockResolvedValue([
      { id: 'r1', date: '2026-10-15', checkIn: '08:50', checkOut: '18:00', status: 'present' },
    ])

    const res = await callApi('?personId=p-target')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.person).toEqual({ id: 'p-target', name: '陈思', department: '算法组' })
  })

  it('still resolves when the person row is missing (empty labels)', async () => {
    mockSession({ userId: 'apikey:k1', provider: 'apikey', role: 'admin' })
    mockPersonFindUnique.mockResolvedValue(null)

    const res = await callApi('?personId=p-gone')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.person).toEqual({ id: 'p-gone', name: '', department: '' })
  })
})

describe('GET /api/attendance/records — self-service resolution', () => {
  it('admin WITHOUT personId falls back to their own linked person (我的考勤)', async () => {
    mockSession({ userId: 'u-admin', provider: 'dingtalk', role: 'admin' })
    mockUserFindUnique.mockResolvedValue({ personId: 'p-self' })

    const res = await callApi('?pageSize=60')
    expect(res.status).toBe(200)
    // The route must query the admin's own linked person, not 400.
    expect(mockAttendanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ personId: 'p-self' }) }),
    )
  })

  it('admin WITH personId queries that person (unchanged)', async () => {
    mockSession({ userId: 'u-admin', provider: 'dingtalk', role: 'admin' })

    const res = await callApi('?personId=p-target')
    expect(res.status).toBe(200)
    expect(mockAttendanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ personId: 'p-target' }) }),
    )
  })

  it('admin without personId and no linked person → 403 no linked person', async () => {
    mockSession({ userId: 'u-admin', provider: 'dingtalk', role: 'admin' })
    mockUserFindUnique.mockResolvedValue({ personId: null })

    const res = await callApi()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'no linked person' })
  })

  it('member is forced to self even when personId is sent (unchanged)', async () => {
    mockSession({ userId: 'u-member', provider: 'dingtalk', role: 'member' })
    mockUserFindUnique.mockResolvedValue({ personId: 'p-self' })

    const res = await callApi('?personId=p-target')
    expect(res.status).toBe(200)
    expect(mockAttendanceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ personId: 'p-self' }) }),
    )
  })

  it('member without linked person → 403 no linked person (unchanged)', async () => {
    mockSession({ userId: 'u-member', provider: 'dingtalk', role: 'member' })
    mockUserFindUnique.mockResolvedValue({ personId: null })

    const res = await callApi()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'no linked person' })
  })

  it('API-key session without personId still requires an explicit personId (unchanged)', async () => {
    mockSession({ userId: 'apikey:k1', provider: 'apikey', role: 'admin' })

    const res = await callApi()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'personId required' })
  })
})
