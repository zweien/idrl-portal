import { NextRequest, NextResponse } from 'next/server'
import { exchangeAuthentikCode, fetchAuthentikUserInfo, getRequestOrigin } from '@/lib/authentik'
import { saveSession } from '@/lib/session'
import { prisma } from '@/lib/db'

const LOGIN_ERROR_URL = '/login?error=authentik_failed'

/**
 * GET /api/auth/callback/authentik?code=...&state=...
 * Authentik redirects here after the user authenticates. We:
 *   1. validate state (CSRF)
 *   2. exchange code → access token
 *   3. fetch userinfo (sub, email, name)
 *   4. upsert User(provider="authentik", externalId=sub); link Person by email
 *   5. sign session cookie, redirect to /dashboard
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  // 1. CSRF: state must match the cookie we set at login.
  const cookieState = req.cookies.get('authentik_oauth_state')?.value
  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(new URL(LOGIN_ERROR_URL, req.url))
  }

  try {
    // 2. exchange code → token
    const origin = getRequestOrigin(req)
    const tokens = await exchangeAuthentikCode(code, origin)

    // 3. fetch userinfo
    const info = await fetchAuthentikUserInfo(tokens.access_token)

    // 4. upsert User; auto-link to a Person with matching email
    let personId: string | undefined
    if (info.email) {
      const person = await prisma.person.findFirst({ where: { email: info.email } })
      personId = person?.id
    }

    const user = await prisma.user.upsert({
      where: {
        provider_externalId: { provider: 'authentik', externalId: info.sub },
      },
      update: {
        // keep person linkage fresh: set if found, leave unchanged if not
        ...(personId ? { personId } : {}),
      },
      create: {
        provider: 'authentik',
        externalId: info.sub,
        role: 'member',
        ...(personId ? { personId } : {}),
      },
    })

    // 5. sign session cookie
    await saveSession({
      userId: user.id,
      provider: 'authentik',
      role: user.role as 'admin' | 'member',
    })

    const res = NextResponse.redirect(new URL('/dashboard', req.url))
    res.cookies.delete('authentik_oauth_state')
    return res
  } catch (e) {
    console.error('authentik callback failed:', e)
    return NextResponse.redirect(new URL(LOGIN_ERROR_URL, req.url))
  }
}
