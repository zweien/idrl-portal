import { NextResponse } from 'next/server'
import { buildAuthentikAuthorizeUrl, getAuthentikConfig } from '@/lib/authentik'
import { randomBytes } from 'crypto'

/**
 * GET /api/auth/login/authentik
 * Redirects the user to Authentik's OIDC authorize endpoint. A random `state`
 * is stored in a short-lived cookie to validate the callback (CSRF defense).
 */
export async function GET() {
  if (!getAuthentikConfig()) {
    return NextResponse.json(
      { error: 'Authentik SSO is not configured' },
      { status: 503 },
    )
  }

  const state = randomBytes(16).toString('hex')
  const url = await buildAuthentikAuthorizeUrl(state)

  const res = NextResponse.redirect(url)
  res.cookies.set('authentik_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 5, // 5 minutes to complete login
  })
  return res
}
