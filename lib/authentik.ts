/**
 * Authentik OIDC configuration, read from env.
 * Provider: "authentik" (intranet SSO).
 */

export interface AuthentikConfig {
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function getAuthentikConfig(): AuthentikConfig | null {
  const issuer = process.env.AUTHENTIK_ISSUER
  const clientId = process.env.AUTHENTIK_CLIENT_ID
  const clientSecret = process.env.AUTHENTIK_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) return null
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3500'
  return {
    issuer,
    clientId,
    clientSecret,
    redirectUri: `${base}/api/auth/callback/authentik`,
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
export async function buildAuthentikAuthorizeUrl(state: string): Promise<string> {
  const config = getAuthentikConfig()
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
export async function exchangeAuthentikCode(code: string): Promise<AuthentikTokens> {
  const config = getAuthentikConfig()
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
