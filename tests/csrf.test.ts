import { describe, it, expect } from 'vitest'
import { assertSameOrigin } from '@/lib/csrf'

/**
 * assertSameOrigin enforces CSRF on cookie-authenticated mutations. Build
 * synthetic Requests with controlled headers and verify allow/deny.
 */
function req(opts: {
  method?: string
  host?: string
  origin?: string | null
  referer?: string | null
  secFetchSite?: string | null
  authorization?: string | null
}): Request {
  const headers = new Headers()
  if (opts.host !== undefined) headers.set('host', opts.host)
  if (opts.origin !== null && opts.origin !== undefined) headers.set('origin', opts.origin)
  if (opts.referer !== null && opts.referer !== undefined) headers.set('referer', opts.referer)
  if (opts.secFetchSite !== null && opts.secFetchSite !== undefined) headers.set('sec-fetch-site', opts.secFetchSite)
  if (opts.authorization !== null && opts.authorization !== undefined) headers.set('authorization', opts.authorization)
  return new Request('https://portal.idrl.top/api/news', { method: opts.method ?? 'POST', headers })
}

describe('assertSameOrigin — Bearer API key exemption', () => {
  it('allows requests with a Bearer token regardless of origin', () => {
    const r = req({ host: 'portal.idrl.top', origin: 'https://evil.com', authorization: 'Bearer idrl_abc' })
    expect(assertSameOrigin(r)).toBeNull()
  })
})

describe('assertSameOrigin — Sec-Fetch-Site', () => {
  it('allows same-origin / same-site / none', () => {
    for (const sfs of ['same-origin', 'same-site', 'none']) {
      const r = req({ host: 'portal.idrl.top', secFetchSite: sfs })
      expect(assertSameOrigin(r), sfs).toBeNull()
    }
  })
  it('blocks cross-site', () => {
    const r = req({ host: 'portal.idrl.top', secFetchSite: 'cross-site' })
    const res = assertSameOrigin(r)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })
})

describe('assertSameOrigin — Origin fallback', () => {
  it('allows when Origin host matches request host', () => {
    const r = req({ host: 'portal.idrl.top', origin: 'https://portal.idrl.top' })
    expect(assertSameOrigin(r)).toBeNull()
  })
  it('blocks when Origin host differs', () => {
    const r = req({ host: 'portal.idrl.top', origin: 'https://evil.com' })
    const res = assertSameOrigin(r)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })
  it('falls back to Referer when Origin absent', () => {
    const r = req({ host: 'portal.idrl.top', origin: null, referer: 'https://portal.idrl.top/dashboard' })
    expect(assertSameOrigin(r)).toBeNull()
  })
  it('blocks Referer from a different host', () => {
    const r = req({ host: 'portal.idrl.top', origin: null, referer: 'https://evil.com/portal' })
    expect(assertSameOrigin(r)?.status).toBe(403)
  })
})

describe('assertSameOrigin — ambiguous requests', () => {
  it('blocks when no origin metadata is present (no Origin/SFS/Referer)', () => {
    const r = req({ host: 'portal.idrl.top', origin: null, referer: null, secFetchSite: null })
    expect(assertSameOrigin(r)?.status).toBe(403)
  })
  it('blocks when host header is absent', () => {
    const r = req({ host: '', origin: 'https://portal.idrl.top' })
    expect(assertSameOrigin(r)?.status).toBe(403)
  })
  it('allows localhost dev (Origin matches localhost host)', () => {
    const r = req({ host: 'localhost:3000', origin: 'http://localhost:3000' })
    expect(assertSameOrigin(r)).toBeNull()
  })
})
