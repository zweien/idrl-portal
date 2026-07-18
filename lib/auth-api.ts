import { NextResponse } from 'next/server'
import { getSession, isAuthenticated, isAdmin, type SessionData } from '@/lib/session'
import { prisma } from '@/lib/db'
import { hashApiKey } from '@/lib/crypto'
import { checkRateLimit, RATE_LIMIT_DEFAULT } from '@/lib/rate-limit'
import type { ApiScope } from '@/lib/types'

/**
 * Require an authenticated session. Returns the session on success, or a 401
 * NextResponse when no user is logged in. Callers must check the return type:
 *   const auth = await requireUser()
 *   if (auth instanceof NextResponse) return auth
 */
export async function requireUser(): Promise<SessionData | NextResponse> {
  const session = await getSession()
  if (!isAuthenticated(session)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return session
}

/**
 * Require an admin session. Returns the session on success, or:
 *   - 401 when no user is logged in
 *   - 403 when logged in but not admin
 */
export async function requireAdmin(): Promise<SessionData | NextResponse> {
  const session = await getSession()
  if (!isAuthenticated(session)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  return session
}

type ApiKeyResolve =
  | { ok: true; id: string }
  | { rateLimited: true; retryAfter: number }
  | null

/**
 * Resolve a Bearer API key from the Authorization header.
 * - returns `{ ok, id }` when a valid, in-scope, under-limit key is present
 * - returns `{ rateLimited, retryAfter }` when the key has exceeded its rate
 *   limit (caller surfaces a 429 with Retry-After)
 * - returns null when no valid key is present (no header, unknown, revoked, or
 *   scope mismatch) — caller then falls back to session auth
 *
 * Revoked keys and keys lacking the requested scope are rejected. Updates
 * lastUsedAt on a successful (under-limit) resolution.
 */
async function resolveApiKey(req: Request, scope: ApiScope): Promise<ApiKeyResolve> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const plaintext = authHeader.slice('Bearer '.length).trim()
  if (!plaintext) return null

  const keyHash = hashApiKey(plaintext)
  const row = await prisma.apiKey.findUnique({
    where: { keyHash },
  })
  // Unknown key, or revoked → treat as no valid key.
  if (!row || row.revokedAt) return null

  let scopes: string[] = []
  try {
    scopes = JSON.parse(row.scopes) as string[]
  } catch {
    return null
  }
  if (!scopes.includes(scope)) return null

  // Rate limit before counting as a use. A limited key gets a 429, not a write.
  // Resolved limit: per-key override, else the global default.
  const limit = row.rateLimitPerMin ?? RATE_LIMIT_DEFAULT
  const rl = await checkRateLimit(row.id, limit)
  if (!rl.allowed) {
    return { rateLimited: true, retryAfter: rl.retryAfter }
  }

  // Fire-and-forget lastUsedAt update.
  await prisma.apiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  })
  return { ok: true, id: row.id }
}

/**
 * Require either (a) an admin session, OR (b) a valid Bearer API key whose
 * scopes include `scope`. Admin sessions always pass regardless of scope.
 * Used by sync/publish endpoints that are triggered both from the admin UI
 * (session) and from external schedulers/scripts (API key).
 *
 *   const auth = await requireScope(req, 'sync:attendance')
 *   if (auth instanceof NextResponse) return auth
 */
export async function requireScope(
  req: Request,
  scope: ApiScope,
): Promise<SessionData | NextResponse> {
  // Try API key first (machine-to-machine).
  const apiKey = await resolveApiKey(req, scope)
  if (apiKey) {
    if ('rateLimited' in apiKey) {
      return NextResponse.json(
        { error: 'rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(apiKey.retryAfter) } },
      )
    }
    // Return a synthetic admin-equivalent session so route handlers can treat
    // authenticated API-key callers uniformly with admin session callers.
    // provider is widened via `unknown` since 'apikey' isn't in AuthProvider.
    return { userId: `apikey:${apiKey.id}`, provider: 'apikey', role: 'admin' } as unknown as SessionData
  }
  // Fall back to admin session (human via admin UI).
  return requireAdmin()
}

/**
 * Require either (a) any authenticated session, OR (b) a valid Bearer API key
 * whose scopes include `scope`. Used by read endpoints (news/resource) so that
 * machine readers with a `news:read` / `resource:read` key can access them,
 * while ordinary users still authenticate via their session cookie.
 *
 * IMPORTANT: read-scope API keys authenticate as a NON-admin identity
 * (role: 'member'), so the route's role-based filtering (drafts hidden,
 * admin-only resources hidden) still applies to them. Only requireScope()
 * (sync/publish, which gates admin-only writes) grants an admin-equivalent
 * synthetic session.
 */
export async function requireUserOrScope(
  req: Request,
  scope: ApiScope,
): Promise<SessionData | NextResponse> {
  const apiKey = await resolveApiKey(req, scope)
  if (apiKey) {
    if ('rateLimited' in apiKey) {
      return NextResponse.json(
        { error: 'rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(apiKey.retryAfter) } },
      )
    }
    return { userId: `apikey:${apiKey.id}`, provider: 'apikey', role: 'member' } as unknown as SessionData
  }
  return requireUser()
}
