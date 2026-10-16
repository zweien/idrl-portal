import { assertSameOrigin } from '@/lib/csrf'
import { NextRequest, NextResponse } from 'next/server'
import { DingTalkFreeLoginError, fetchDingTalkUserByAuthCode } from '@/lib/dingtalk'
import { getEnterpriseAccessToken } from '@/lib/dingtalk-admin'
import { signInDingTalkUser } from '@/lib/dingtalk-identity'

/**
 * POST /api/auth/dingtalk/exchange-authcode   body: { authCode }
 *
 * In-client free-login (钉钉端内免登). The login page's JSAPI
 * `dd.runtime.permission.requestAuthCode` yields a 免登授权码 (5 min,
 * single-use) when the portal is opened from the DingTalk workbench; this
 * endpoint exchanges it for the user's identity and signs a session.
 *
 * This is the topapi counterpart of the scan-code callback — the JSAPI
 * free-login code is NOT an OAuth2 code and must not go through
 * /v1.0/oauth2/userAccessToken (see lib/dingtalk.ts module doc).
 *
 * Responses:
 *   200 { ok: true, role }
 *   400 { error }  missing authCode / invalid or expired code (40078)
 *   403 { error }  user not in visible scope (40079) or offboarded/banned
 *   503 { error }  DingTalk SSO not configured
 *   502 { error }  DingTalk API failure
 *
 * The authCode is single-use and short-lived; never log its value.
 */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  if (!process.env.DINGTALK_CLIENT_ID || !process.env.DINGTALK_CLIENT_SECRET) {
    return NextResponse.json({ error: 'DingTalk SSO is not configured' }, { status: 503 })
  }

  let authCode = ''
  try {
    const body = await req.json() as { authCode?: unknown }
    if (typeof body.authCode === 'string') authCode = body.authCode
  } catch {
    // fall through to the missing-code 400 below
  }
  if (!authCode || authCode.length > 256) {
    return NextResponse.json(
      { error: '缺少免登授权码，请从钉钉工作台重新打开应用' },
      { status: 400 },
    )
  }

  try {
    const accessToken = await getEnterpriseAccessToken()
    const user = await fetchDingTalkUserByAuthCode(authCode, accessToken)

    const outcome = await signInDingTalkUser({
      externalId: user.unionid ?? user.userid,
      personMatchId: user.unionid,
      source: 'in-client',
    })
    if (!outcome.ok) {
      return NextResponse.json({ error: 'disabled' }, { status: 403 })
    }
    return NextResponse.json({ ok: true, role: outcome.role })
  } catch (e) {
    if (e instanceof DingTalkFreeLoginError) {
      const status = e.errcode === 40078 ? 400 : e.errcode === 40079 ? 403 : 502
      return NextResponse.json(
        { error: e.userMessage, errcode: e.errcode },
        { status },
      )
    }
    console.error('dingtalk free-login exchange failed:', e)
    return NextResponse.json({ error: '钉钉免登失败，请稍后重试或使用扫码登录' }, { status: 502 })
  }
}
