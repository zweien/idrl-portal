/**
 * DingTalk (钉钉) scan-code OAuth2 configuration, read from env.
 * Provider: "dingtalk" (internet SSO).
 *
 * Flow (new-style OAuth2 scan login):
 *   1. authorize: https://login.dingtalk.com/oauth2/auth?...response_type=code&scope=openid
 *   2. callback → code
 *   3. userAccessToken: POST https://api.dingtalk.com/v1.0/oauth2/userAccessToken
 *   4. userinfo:   GET  https://api.dingtalk.com/v1.0/contact/users/me
 *
 * Reference: https://open.dingtalk.com/document/org/scan-qr-code-to-login-3rdapp
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
