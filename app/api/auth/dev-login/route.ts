import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { saveSession } from '@/lib/session'

/**
 * DEVELOPMENT ONLY local-login session issuer.
 *
 * Gives the dev login form a real iron-session cookie so middleware lets the
 * session through. Production is 404 — real auth is SSO (Authentik/DingTalk).
 *
 * - 404 in production.
 * - Accepts { username }, upserts a local User. Role comes from the User
 *   record (seeded admin via `pnpm db:seed`; new usernames default to member),
 *   NOT from a hardcoded `username === 'admin'` check.
 * - No password check: dev convenience only.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  let username: string | undefined
  try {
    const body = await req.json()
    username = body?.username
  } catch {
    // empty body allowed below
  }
  if (!username || typeof username !== 'string') {
    return NextResponse.json({ error: 'username required' }, { status: 400 })
  }

  const user = await prisma.user.upsert({
    where: { provider_externalId: { provider: 'local', externalId: username } },
    // never overwrite an existing user's role on dev login
    update: {},
    create: { provider: 'local', externalId: username, role: 'member' },
  })

  await saveSession({ userId: user.id, provider: 'local', role: user.role as 'admin' | 'member' })

  return NextResponse.json({ ok: true, role: user.role })
}

