import { NextResponse } from 'next/server'
import { getSession, isAuthenticated, isAdmin, type SessionData } from '@/lib/session'

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
