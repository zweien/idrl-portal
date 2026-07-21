/**
 * Authentik OIDC configuration, read from env.
 * Provider: "authentik" (intranet SSO).
 */

export { getRequestOrigin } from './request-origin'

export interface AuthentikConfig {
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * Resolve the portal's public origin. Pass `reqOrigin` (derived from the
 * incoming request's Host/x-forwarded-* headers) to strict-match the
 * redirect_uri Authentik has registered; falls back to NEXT_PUBLIC_BASE_URL,
 * then localhost (dev only). In production without either, returns null so
 * the caller can 503 instead of mis-redirecting to localhost.
 */
function resolvePortalOrigin(reqOrigin?: string): string | null {
  if (reqOrigin) return reqOrigin
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3500'
  return null
}

export function getAuthentikConfig(reqOrigin?: string): AuthentikConfig | null {
  const issuer = process.env.AUTHENTIK_ISSUER
  const clientId = process.env.AUTHENTIK_CLIENT_ID
  const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) return null
  const origin = resolvePortalOrigin(reqOrigin)
  if (!origin) return null
  return {
    // normalize issuer to end with a single slash (discovery URL relies on it)
    issuer: issuer.endsWith('/') ? issuer : `${issuer}/`,
    clientId,
    clientSecret,
    redirectUri: `${origin}/api/auth/callback/authentik`,
  }
}

export interface AuthentikTokens {
  access_token: string
  id_token?: string
  token_type: string
}

export interface AuthentikUserInfo {
  sub: string
  preferred_username?: string
  email?: string
  name?: string
}

/** Fetch OIDC discovery document (caches the structure inline). */
async function getDiscovery(config: AuthentikConfig) {
  const res = await fetch(
    `${config.issuer}.well-known/openid-configuration`,
    { cache: 'no-store' },
  )
  if (!res.ok) {
    throw new Error(`Authentik discovery failed: ${res.status}`)
  }
  return res.json() as Promise<{
    authorization_endpoint: string
    token_endpoint: string
    userinfo_endpoint: string
  }>
}

/** Build the authorize redirect URL with PKCE-less code flow. */
export async function buildAuthentikAuthorizeUrl(state: string, reqOrigin?: string): Promise<string> {
  const config = getAuthentikConfig(reqOrigin)
  if (!config) throw new Error('Authentik not configured')
  const discovery = await getDiscovery(config)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openid email profile',
    state,
  })
  return `${discovery.authorization_endpoint}?${params.toString()}`
}

/** Exchange an authorization code for tokens. */
export async function exchangeAuthentikCode(code: string, reqOrigin?: string): Promise<AuthentikTokens> {
  const config = getAuthentikConfig(reqOrigin)
  if (!config) throw new Error('Authentik not configured')
  const discovery = await getDiscovery(config)
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })
  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`token exchange failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<AuthentikTokens>
}

/** Fetch userinfo with an access token. */
export async function fetchAuthentikUserInfo(accessToken: string): Promise<AuthentikUserInfo> {
  const config = getAuthentikConfig()
  if (!config) throw new Error('Authentik not configured')
  const discovery = await getDiscovery(config)
  const res = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`userinfo failed: ${res.status}`)
  }
  return res.json() as Promise<AuthentikUserInfo>
}
