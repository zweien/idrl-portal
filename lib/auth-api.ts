import { NextResponse } from 'next/server'
import { getSession, isAuthenticated, isAdmin, type SessionData } from '@/lib/session'
import { prisma } from '@/lib/db'
import { hashApiKey } from '@/lib/crypto'
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

/**
 * Resolve a Bearer API key from the Authorization header. Returns the ApiKey
 * row (with scopes parsed) on success, or null when no valid key is present.
 * Revoked keys and keys lacking the requested scope are rejected. Updates
 * lastUsedAt on success.
 */
async function resolveApiKey(req: Request, scope: ApiScope) {
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

  // Fire-and-forget lastUsedAt update.
  await prisma.apiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  })
  return row
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
 * while ordinary users still authenticate via their session cookie. Admin-only
 * filtering is decided by the route based on `session.role === 'admin'`.
 */
export async function requireUserOrScope(
  req: Request,
  scope: ApiScope,
): Promise<SessionData | NextResponse> {
  const apiKey = await resolveApiKey(req, scope)
  if (apiKey) {
    return { userId: `apikey:${apiKey.id}`, provider: 'apikey', role: 'admin' } as unknown as SessionData
  }
  return requireUser()
}
