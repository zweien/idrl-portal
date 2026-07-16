import { NextResponse, type NextRequest } from 'next/server'
import { buildDingTalkAuthorizeUrl, getDingTalkConfig, getRequestOrigin } from '@/lib/dingtalk'
import { randomBytes } from 'crypto'

/**
 * GET /api/auth/login/dingtalk
 * Redirects the user to DingTalk's scan-code authorize page. A random `state`
 * is stored in a short-lived cookie to validate the callback (CSRF defense).
 */
export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req)
  if (!getDingTalkConfig(origin)) {
    return NextResponse.json(
      { error: 'DingTalk SSO is not configured' },
      { status: 503 },
    )
  }

  const state = randomBytes(16).toString('hex')
  const url = await buildDingTalkAuthorizeUrl(state, origin)

  const res = NextResponse.redirect(url)
  res.cookies.set('dingtalk_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 5, // 5 minutes to complete login
  })
  return res
}
