/**
 * DingTalk (钉钉) login flows, read from env. Provider: "dingtalk" (internet SSO).
 *
 * Two independent code types — do NOT mix them (a mixed code fails with
 * errcode 40078):
 *
 * 1. Browser scan-code OAuth2 (buildDingTalkAuthorizeUrl → exchangeDingTalkCode):
 *      1. authorize: https://login.dingtalk.com/oauth2/auth?...response_type=code&scope=openid
 *      2. callback → code
 *      3. userAccessToken: POST https://api.dingtalk.com/v1.0/oauth2/userAccessToken
 *      4. userinfo:   GET  https://api.dingtalk.com/v1.0/contact/users/me
 *
 * 2. In-client free-login (fetchDingTalkUserByAuthCode): the JSAPI
 *    `dd.runtime.permission.requestAuthCode` (see components/dingtalk-free-login.tsx)
 *    yields a 免登授权码 (5 min, single-use), which the server exchanges via the
 *    enterprise access_token (lib/dingtalk-admin.ts#getEnterpriseAccessToken):
 *      POST https://oapi.dingtalk.com/topapi/v2/user/getuserinfo → userid/unionid
 *    The OAuth2 userAccessToken endpoint officially documents only OAuth codes,
 *    so the free-login code deliberately goes through topapi instead.
 *
 * References:
 *   https://open.dingtalk.com/document/org/scan-qr-code-to-login-3rdapp
 *   https://open.dingtalk.com/document/development/enterprise-internal-application-logon-free
 *   docs/research/2026-10-16-dingtalk-client-free-login.md
 */

export interface DingTalkConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

const AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/auth'
const TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken'
const USERINFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me'

export { getRequestOrigin } from './request-origin'

function resolvePortalOrigin(reqOrigin?: string): string | null {
  if (reqOrigin) return reqOrigin
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3500'
  return null
}

export function getDingTalkConfig(reqOrigin?: string): DingTalkConfig | null {
  const clientId = process.env.DINGTALK_CLIENT_ID
  const clientSecret = process.env.DINGTALK_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const origin = resolvePortalOrigin(reqOrigin)
  if (!origin) return null
  return {
    clientId,
    clientSecret,
    redirectUri: `${origin}/api/auth/callback/dingtalk`,
  }
}

/** Build the DingTalk authorize redirect URL (full-page navigation). */
export async function buildDingTalkAuthorizeUrl(state: string, reqOrigin?: string): Promise<string> {
  const config = getDingTalkConfig(reqOrigin)
  if (!config) throw new Error('DingTalk not configured')
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid', // scan-code login requires the openid scope
    state,
    prompt: 'consent',
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export interface DingTalkTokens {
  accessToken: string
  refreshToken?: string
  expireIn?: number
}

/** Exchange a user authorization code for a userAccessToken. */
export async function exchangeDingTalkCode(code: string, reqOrigin?: string): Promise<DingTalkTokens> {
  const config = getDingTalkConfig(reqOrigin)
  if (!config) throw new Error('DingTalk not configured')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      grantType: 'authorization_code',
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DingTalk token exchange failed: ${res.status} ${text}`)
  }
  const data = await res.json() as {
    accessToken: string
    refreshToken?: string
    expireIn?: number
  }
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expireIn: data.expireIn,
  }
}

export interface DingTalkUserInfo {
  /** Stable cross-app identifier. Used as User.externalId. */
  unionId?: string
  /** Per-app identifier. */
  openId?: string
  nick?: string
  email?: string
  mobile?: string
}

/** Fetch the logged-in user's contact info with a userAccessToken. */
export async function fetchDingTalkUserInfo(accessToken: string): Promise<DingTalkUserInfo> {
  const res = await fetch(USERINFO_URL, {
    headers: { 'x-acs-dingtalk-access-token': accessToken },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DingTalk userinfo failed: ${res.status} ${text}`)
  }
  const data = await res.json() as DingTalkUserInfo
  return data
}

// ── in-client free-login (JSAPI authCode) ─────────────

const FREE_LOGIN_URL = 'https://oapi.dingtalk.com/topapi/v2/user/getuserinfo'

export interface DingTalkLoginFreeUser {
  /** Enterprise-internal user id. */
  userid: string
  /** Cross-app stable id — matches the OAuth path and Person.dingUserId. */
  unionid?: string
  name?: string
  device_id?: string
  /** Admin flags (sys_level: 1 主管理员 / 2 子管理员 / 100 老板 / 0 其他). */
  sys?: boolean
  sys_level?: number
}

/**
 * DingTalk rejected a 免登授权码. `errcode` 40078 = code invalid / expired /
 * already used / wrong code type; 40079 = user not in the app's visible scope
 * (or free-login permission missing / called before dd.ready).
 */
export class DingTalkFreeLoginError extends Error {
  constructor(
    public readonly errcode: number,
    public readonly errmsg: string,
  ) {
    super(`DingTalk free-login failed: ${errcode} ${errmsg}`)
    this.name = 'DingTalkFreeLoginError'
  }

  /** User-facing message for the login page (Chinese, actionable). */
  get userMessage(): string {
    if (this.errcode === 40078) return '免登授权码无效或已过期，请从钉钉工作台重新打开应用'
    if (this.errcode === 40079) return '当前账号不在应用可见范围内，请联系管理员添加'
    return `钉钉免登失败（${this.errcode}），请使用扫码登录`
  }
}

/**
 * Exchange a JSAPI free-login authCode for the user's identity via the
 * enterprise access_token. `accessToken` comes from
 * lib/dingtalk-admin.ts#getEnterpriseAccessToken() (cached, 7200s).
 */
export async function fetchDingTalkUserByAuthCode(
  authCode: string,
  accessToken: string,
): Promise<DingTalkLoginFreeUser> {
  const res = await fetch(`${FREE_LOGIN_URL}?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: authCode }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DingTalk getuserinfo failed: ${res.status} ${text}`)
  }
  const data = await res.json() as {
    errcode?: number
    errmsg?: string
    result?: DingTalkLoginFreeUser
  }
  if (data.errcode) {
    throw new DingTalkFreeLoginError(data.errcode, data.errmsg ?? '')
  }
  if (!data.result?.userid) {
    throw new Error('DingTalk getuserinfo returned no userid')
  }
  return data.result
}
