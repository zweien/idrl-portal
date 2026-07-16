import { NextRequest, NextResponse } from 'next/server'
import { exchangeDingTalkCode, fetchDingTalkUserInfo, getRequestOrigin } from '@/lib/dingtalk'
import { saveSession } from '@/lib/session'
import { prisma } from '@/lib/db'

const LOGIN_ERROR_URL = '/login?error=dingtalk_failed'

/**
 * GET /api/auth/callback/dingtalk?code=...&state=...
 * DingTalk redirects here after the user scans + confirms. We:
 *   1. validate state (CSRF)
 *   2. exchange code → userAccessToken
 *   3. fetch userinfo (unionId/openId/nick/email)
 *   4. upsert User(provider="dingtalk", externalId=unionId); link Person by dingUserId
 *   5. sign session cookie, redirect to /dashboard
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
    return NextResponse.redirect(new URL(LOGIN_ERROR_URL, req.url))
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

    // 4. upsert User; auto-link to a Person whose dingUserId matches the
    //    (legacy) Person.dingUserId field. Prefer unionId for matching since
    //    Person.dingUserId historically stored the dingtalk user id.
    let personId: string | undefined
    const byDing = info.unionId
      ? await prisma.person.findFirst({ where: { dingUserId: info.unionId } })
      : undefined
    if (byDing) personId = byDing.id

    const user = await prisma.user.upsert({
      where: {
        provider_externalId: { provider: 'dingtalk', externalId },
      },
      update: {
        // keep person linkage fresh: set if found, leave unchanged if not
        ...(personId ? { personId } : {}),
      },
      create: {
        provider: 'dingtalk',
        externalId,
        role: 'member',
        ...(personId ? { personId } : {}),
      },
    })

    // 5. sign session cookie
    await saveSession({
      userId: user.id,
      provider: 'dingtalk',
      role: user.role as 'admin' | 'member',
    })

    const res = NextResponse.redirect(new URL('/dashboard', req.url))
    res.cookies.delete('dingtalk_oauth_state')
    return res
  } catch (e) {
    console.error('dingtalk callback failed:', e)
    return NextResponse.redirect(new URL(LOGIN_ERROR_URL, req.url))
  }
}
