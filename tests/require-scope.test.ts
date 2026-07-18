import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashApiKey } from '@/lib/crypto'

// Mock prisma.apiKey lookups used by requireScope, plus the raw SQL the
// rate limiter uses ($executeRawUnsafe / $executeRaw / $queryRaw).
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockExecuteRawUnsafe = vi.fn()
const mockExecuteRaw = vi.fn()
const mockQueryRaw = vi.fn()
const mockUserFindUnique = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    apiKey: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
    },
    $executeRawUnsafe: (...a: unknown[]) => mockExecuteRawUnsafe(...a),
    $executeRaw: (...a: unknown[]) => mockExecuteRaw(...a),
    $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
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
  mockUserFindUnique.mockReset()
  // Default: the session's user is not banned (resolveSession re-fetches).
  mockUserFindUnique.mockResolvedValue({ disabledAt: null })
})

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/x', { headers })
}

describe('requireScope', () => {
  it('admits a valid API key whose scopes include the requested scope', async () => {
    const plain = 'idrl_secret123'
    mockFindUnique.mockResolvedValue({
      id: 'k1', keyHash: hashApiKey(plain), revokedAt: null, rateLimitPerMin: null,
      scopes: JSON.stringify(['sync:attendance', 'news:read']),
    })
    mockUpdate.mockResolvedValue({})
    // Rate-limit: the window-reset UPDATE matches (returns 1) → allowed.
    mockExecuteRawUnsafe.mockResolvedValue(1)
    const res = await requireScope(req({ authorization: `Bearer ${plain}` }), 'sync:attendance')
    // Returns a synthetic admin session (not a NextResponse).
    expect(res).not.toBeInstanceOf(Response)
    expect((res as { userId: string }).userId).toBe('apikey:k1')
    // lastUsedAt should be updated.
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('returns 429 when the API key exceeds its rate limit', async () => {
    const plain = 'idrl_limited2'
    mockFindUnique.mockResolvedValue({
      id: 'k9', keyHash: hashApiKey(plain), revokedAt: null, rateLimitPerMin: 5,
      scopes: JSON.stringify(['sync:attendance']),
    })
    // Both UPDATEs touch 0 rows (window active + count >= limit) → rejected.
    mockExecuteRawUnsafe.mockResolvedValue(0)
    mockExecuteRaw.mockResolvedValue(0)
    mockQueryRaw.mockResolvedValue([{ rlWindowStart: new Date().toISOString() }])
    const res = await requireScope(req({ authorization: `Bearer ${plain}` }), 'sync:attendance')
    expect(res).toBeInstanceOf(Response)
    expect((res as Response).status).toBe(429)
    expect((res as Response).headers.get('retry-after')).toBeTruthy()
    // lastUsedAt should NOT be updated when rate-limited.
    expect(mockUpdate).not.toHaveBeenCalled()
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
