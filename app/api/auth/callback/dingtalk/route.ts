import { NextResponse, type NextRequest } from 'next/server'
import { exchangeDingTalkCode, fetchDingTalkUserInfo, getRequestOrigin } from '@/lib/dingtalk'
import { signInDingTalkUser } from '@/lib/dingtalk-identity'

const LOGIN_ERROR_URL = '/login?error=dingtalk_failed'
const LOGIN_DISABLED_URL = '/login?error=disabled'

/**
 * GET /api/auth/callback/dingtalk?code=...&state=...
 * DingTalk redirects here after the user scans + confirms. We:
 *   1. validate state (CSRF)
 *   2. exchange code → userAccessToken
 *   3. fetch userinfo (unionId/openId/nick/email)
 *   4. upsert User + link Person + sign session (shared with the in-client
 *      free-login path — lib/dingtalk-identity.ts)
 *   5. redirect to /dashboard
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  // DingTalk's new OAuth2 (login.dingtalk.com/oauth2/auth) returns the
  // authorization code as `authCode`; the legacy oapi flow used `code`.
  // Accept both for safety, prefer the new-style param.
  const code = searchParams.get('authCode') ?? searchParams.get('code')
  const state = searchParams.get('state')

  // 1. CSRF: state must match the cookie we set at login.
  const cookieState = req.cookies.get('dingtalk_oauth_state')?.value
  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(new URL(LOGIN_ERROR_URL, getRequestOrigin(req)))
  }

  try {
    const origin = getRequestOrigin(req)

    // 2. exchange code → token
    const tokens = await exchangeDingTalkCode(code, origin)

    // 3. fetch userinfo
    const info = await fetchDingTalkUserInfo(tokens.accessToken)
    const externalId = info.unionId ?? info.openId
    if (!externalId) {
      throw new Error('DingTalk userinfo returned no unionId/openId')
    }

    // 4. upsert + session (offboarded users are rejected inside)
    const outcome = await signInDingTalkUser({
      externalId,
      personMatchId: info.unionId,
      source: 'scan',
    })
    if (!outcome.ok) {
      return NextResponse.redirect(new URL(LOGIN_DISABLED_URL, origin))
    }

    const res = NextResponse.redirect(new URL('/dashboard', origin))
    res.cookies.delete('dingtalk_oauth_state')
    return res
  } catch (e) {
    console.error('dingtalk callback failed:', e)
    return NextResponse.redirect(new URL(LOGIN_ERROR_URL, getRequestOrigin(req)))
  }
}
