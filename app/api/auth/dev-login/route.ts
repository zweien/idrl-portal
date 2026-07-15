import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { saveSession } from '@/lib/session'

/**
 * DEVELOPMENT ONLY server-side session issuer.
 *
 * Until auth slices #4/#5/#6 land, the legacy mock login (auth-context.tsx)
 * only writes sessionStorage on the client — which middleware can't see, so
 * the dashboard was unreachable (Codex P1 on #10). This dev-only endpoint
 * gives the mock login a real iron-session cookie so the protection layer
 * can be exercised end-to-end in development.
 *
 * - 404 in production.
 * - Accepts { username } and upserts a local User (admin role for "admin",
 *   member otherwise), then signs the session cookie.
 * - No password check: this is a dev convenience, not real auth. Removed in #6.
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

  const role = username === 'admin' ? 'admin' : 'member'

  const user = await prisma.user.upsert({
    where: { provider_externalId: { provider: 'local', externalId: username } },
    update: { role },
    create: { provider: 'local', externalId: username, role },
  })

  await saveSession({ userId: user.id, provider: 'local', role })

  return NextResponse.json({ ok: true, role })
}
