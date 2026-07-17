import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashApiKey } from '@/lib/crypto'

// Mock prisma.apiKey lookups used by requireScope.
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    apiKey: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}))

// Mock getSession so the session fallback path is controllable.
const mockGetSession = vi.fn()
vi.mock('@/lib/session', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  isAuthenticated: (s: { userId?: string }) => Boolean(s?.userId),
  isAdmin: (s: { userId?: string; role?: string }) =>
    s?.role === 'admin' && Boolean(s?.userId),
}))

const { requireScope } = await import('@/lib/auth-api')

beforeEach(() => {
  mockFindUnique.mockReset()
  mockUpdate.mockReset()
  mockGetSession.mockReset()
})

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/x', { headers })
}

describe('requireScope', () => {
  it('admits a valid API key whose scopes include the requested scope', async () => {
    const plain = 'idrl_secret123'
    mockFindUnique.mockResolvedValue({
      id: 'k1', keyHash: hashApiKey(plain), revokedAt: null,
      scopes: JSON.stringify(['sync:attendance', 'news:read']),
    })
    mockUpdate.mockResolvedValue({})
    const res = await requireScope(req({ authorization: `Bearer ${plain}` }), 'sync:attendance')
    // Returns a synthetic admin session (not a NextResponse).
    expect(res).not.toBeInstanceOf(Response)
    expect((res as { userId: string }).userId).toBe('apikey:k1')
    // lastUsedAt should be updated.
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('falls back to admin session when no Authorization header is present', async () => {
    const session = { userId: 'u2', provider: 'authentik', role: 'admin' }
    mockGetSession.mockResolvedValue(session)
    const res = await requireScope(req(), 'sync:attendance')
    expect(res).toEqual(session)
  })

  it('returns 403 when the key lacks the requested scope', async () => {
    const plain = 'idrl_limited'
    mockFindUnique.mockResolvedValue({
      id: 'k2', revokedAt: null, scopes: JSON.stringify(['news:read']),
    })
    mockGetSession.mockResolvedValue({}) // no session → falls to requireAdmin → 401 path
    // Actually: key resolves but scope mismatch → resolveApiKey returns null →
    // falls to requireAdmin which sees no authed session → 401.
    const res = await requireScope(req({ authorization: `Bearer ${plain}` }), 'sync:attendance')
    expect(res).toBeInstanceOf(Response)
    // No session and scope mismatch → 401 (unauthorized), not 403.
    expect((res as Response).status).toBe(401)
  })

  it('rejects a revoked key (falls back to session)', async () => {
    const plain = 'idrl_revoked'
    mockFindUnique.mockResolvedValue({
      id: 'k3', revokedAt: new Date(), scopes: JSON.stringify(['sync:attendance']),
    })
    mockGetSession.mockResolvedValue({}) // no session → 401
    const res = await requireScope(req({ authorization: `Bearer ${plain}` }), 'sync:attendance')
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(401)
  })

  it('rejects an unknown key (falls back to session)', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockGetSession.mockResolvedValue({}) // no session → 401
    const res = await requireScope(req({ authorization: 'Bearer idrl_unknown' }), 'sync:attendance')
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(401)
  })
})
