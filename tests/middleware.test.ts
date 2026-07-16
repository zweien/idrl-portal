import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetSessionFromRequest = vi.fn()
vi.mock('@/lib/session', () => ({
  getSessionFromRequest: (...args: unknown[]) => mockGetSessionFromRequest(...args),
  isAuthenticated: (s: { userId?: string }) => Boolean(s?.userId),
  isAdmin: (s: { userId?: string; role?: string }) =>
    s?.role === 'admin' && Boolean(s?.userId),
}))

const middlewareMod = await import('@/middleware')
const middleware = middlewareMod.middleware

function makeReq(pathname: string): NextRequest {
  return new NextRequest(new URL(`http://localhost:3500${pathname}`))
}

beforeEach(() => mockGetSessionFromRequest.mockReset())

describe('middleware route protection', () => {
  it('redirects unauthenticated /dashboard to /login', async () => {
    mockGetSessionFromRequest.mockResolvedValue({})
    const res = await middleware(makeReq('/dashboard'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('admits an authenticated user to /dashboard', async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: 'u1', provider: 'local', role: 'member' })
    const res = await middleware(makeReq('/dashboard'))
    expect(res.status).toBe(200)
  })

  it('redirects unauthenticated /dashboard/admin to /login', async () => {
    mockGetSessionFromRequest.mockResolvedValue({})
    const res = await middleware(makeReq('/dashboard/admin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects a non-admin away from /dashboard/admin', async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: 'u1', provider: 'local', role: 'member' })
    const res = await middleware(makeReq('/dashboard/admin'))
    expect(res.status).toBe(307)
    // non-admin is sent to /dashboard, not /login (they ARE logged in)
    const loc = res.headers.get('location') || ''
    expect(loc).toContain('/dashboard')
    expect(loc).not.toMatch(/\/login(\?|$)/)
  })

  it('admits an admin to /dashboard/admin', async () => {
    mockGetSessionFromRequest.mockResolvedValue({ userId: 'u2', provider: 'authentik', role: 'admin' })
    const res = await middleware(makeReq('/dashboard/admin/floor-layout'))
    expect(res.status).toBe(200)
  })
})
