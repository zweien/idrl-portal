import { describe, it, expect } from 'vitest'
import { getIronSession, sealData, unsealData } from 'iron-session'
import type { SessionData } from '@/lib/session'

const SECRET = 'test-secret-at-least-thirty-two-chars-long-xx'
const COOKIE = 'idrl_session'

/**
 * Minimal { get, set } object iron-session reads/writes cookies against,
 * backed by a plain jar so write→read round-trips through real seal/unseal.
 * iron-session's CookieStore type isn't exported and getIronSession's first
 * param is a union with IncomingMessage, so we type the helper's return as
 * the call-site expects and cast at each getIronSession call.
 */
function makeCookieStore(initial: Record<string, string> = {}) {
  const jar: Record<string, string> = { ...initial }
  return {
    get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined),
    set: (name: string, value: string) => { jar[name] = value },
  }
}

const opts = { password: SECRET, cookieName: COOKIE, ttl: 60 }

describe('session: iron round-trip', () => {
  it('persists userId/provider/role across write → read', async () => {
    const store = makeCookieStore()
    const w = await getIronSession<SessionData>(store as never, opts)
    w.userId = 'u1'; w.provider = 'authentik'; w.role = 'admin'
    await w.save()
    // re-read against the same jar
    const read = await getIronSession<SessionData>(store as never, opts)
    expect(read.userId).toBe('u1')
    expect(read.provider).toBe('authentik')
    expect(read.role).toBe('admin')
  })

  it('returns an empty session when no cookie was written', async () => {
    const store = makeCookieStore()
    const read = await getIronSession<SessionData>(store as never, opts)
    expect(read.userId).toBeUndefined()
    expect(read.role).toBeUndefined()
  })

  it('clears the session on destroy()', async () => {
    const store = makeCookieStore()
    const w = await getIronSession<SessionData>(store as never, opts)
    w.userId = 'u1'; w.role = 'admin'
    await w.save()
    w.destroy()
    const read = await getIronSession<SessionData>(store as never, opts)
    expect(read.userId).toBeUndefined()
  })

  it('does NOT recover the payload from a tampered cookie (iron is forgiving → empty)', async () => {
    const sealed = await sealData(
      { userId: 'u1', provider: 'local', role: 'admin' },
      { password: SECRET },
    )
    const flipped = sealed.slice(0, -1) + (sealed.endsWith('A') ? 'B' : 'A')
    // iron-session v8 unseal is forgiving: a bad seal resolves to {} rather
    // than throwing. The security guarantee is that the payload is NOT leaked.
    const result = await unsealData(flipped, { password: SECRET }) as SessionData
    expect(result.userId).toBeUndefined()
  })

  it('does NOT recover the payload when unsealed with the wrong secret', async () => {
    const sealed = await sealData(
      { userId: 'u1', provider: 'local', role: 'admin' },
      { password: SECRET },
    )
    const result = await unsealData(sealed, { password: 'a-completely-different-secret-also-long' }) as SessionData
    expect(result.userId).toBeUndefined()
  })
})
