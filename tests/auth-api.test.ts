import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock getSession so the auth helpers don't touch next/headers or a cookie.
// The mock is configured per-test via mockGetSession.
const mockGetSession = vi.fn()
vi.mock('@/lib/session', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  isAuthenticated: (s: { userId?: string }) => Boolean(s?.userId),
  isAdmin: (s: { userId?: string; role?: string }) =>
    s?.role === 'admin' && Boolean(s?.userId),
}))

// Import AFTER the mock is registered.
const { requireUser, requireAdmin } = await import('@/lib/auth-api')

beforeEach(() => mockGetSession.mockReset())

describe('requireUser', () => {
  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValue({})
    const res = await requireUser()
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(401)
  })

  it('returns the session when authenticated', async () => {
    const session = { userId: 'u1', provider: 'local', role: 'member' }
    mockGetSession.mockResolvedValue(session)
    const res = await requireUser()
    expect(res).toEqual(session)
  })

  it('admits a member (admin-only check is requireAdmin, not requireUser)', async () => {
    const session = { userId: 'u1', provider: 'local', role: 'member' }
    mockGetSession.mockResolvedValue(session)
    const res = await requireUser()
    expect(res).toEqual(session)
  })
})

describe('requireAdmin', () => {
  it('returns 401 when there is no session', async () => {
    mockGetSession.mockResolvedValue({})
    const res = await requireAdmin()
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(401)
  })

  it('returns 403 when logged in as member', async () => {
    mockGetSession.mockResolvedValue({ userId: 'u1', provider: 'local', role: 'member' })
    const res = await requireAdmin()
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(403)
  })

  it('returns the session when logged in as admin', async () => {
    const session = { userId: 'u2', provider: 'authentik', role: 'admin' }
    mockGetSession.mockResolvedValue(session)
    const res = await requireAdmin()
    expect(res).toEqual(session)
  })

  it('returns 401 when userId present but role missing (not authenticated)', async () => {
    // role without userId is not authenticated; userId without role likewise
    mockGetSession.mockResolvedValue({ role: 'admin' })
    const res = await requireAdmin()
    expect((res as Response).status).toBe(401)
  })
})
