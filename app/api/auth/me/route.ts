import { NextResponse } from 'next/server'
import { getSession, isAuthenticated } from '@/lib/session'

/**
 * GET /api/auth/me
 * Returns the current user identity from the server-side session, so the
 * client (AuthProvider) can hydrate after an SSO login that only set the
 * iron-session cookie. Replaces the legacy sessionStorage-only source of
 * truth for the client.
 */
export async function GET() {
  const session = await getSession()
  if (!isAuthenticated(session)) {
    return NextResponse.json({ user: null })
  }
  return NextResponse.json({
    user: {
      userId: session.userId,
      provider: session.provider,
      role: session.role,
    },
  })
}
