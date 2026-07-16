import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/session'

/**
 * POST /api/auth/logout
 * Destroys the iron-session cookie and redirects to /login. Used by the nav
 * bar's logout action (replaces the legacy client-only sessionStorage clear,
 * which never invalidated the server session).
 */
export async function POST() {
  await destroySession()
  return NextResponse.json({ ok: true })
}
