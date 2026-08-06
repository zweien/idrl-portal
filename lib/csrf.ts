/**
 * CSRF protection for cookie-authenticated state-changing requests.
 *
 * The session cookie is `sameSite: 'lax'`, which blocks the most common
 * cross-site POST (form submissions from another origin) but does NOT cover
 * "simple" content types a browser will send cross-site without a preflight —
 * `multipart/form-data` (uploads), `application/x-www-form-urlencoded`, and
 * `text/plain`. Those mutation routes are therefore vulnerable to CSRF.
 *
 * This implements the OWASP-recommended Origin/Sec-Fetch-Site check (no token
 * required, transparent to the SPA):
 *   - Requests carrying a `Bearer` API key are EXEMPT — browsers never attach
 *     `Authorization` headers automatically, so a cross-site page cannot forge
 *     one. API keys are CSRF-safe by construction.
 *   - For cookie-authenticated requests, require either:
 *       a) `Sec-Fetch-Site` ∈ {same-origin, same-site, none} (modern browsers
 *          send this on every fetch; `none` = a direct user action like typing
 *          the URL), OR
 *       b) an `Origin`/`Referer` whose host matches the request's target host
 *          (fallback for older clients / non-fetch navigations).
 *   - A request with NO Origin AND NO Sec-Fetch-Site AND NO Referer is allowed
 *     only if it's a same-origin server-to-server call (rare); for browser
 *     mutations we treat absent origin metadata as suspicious and reject.
 *
 * Apply this to every state-changing route that accepts cookie auth
 * (POST/PATCH/PUT/DELETE). GET is safe-by-idempotent and skipped.
 */

import { NextResponse } from 'next/server'

/** True if the request bears a Bearer API key (CSRF-exempt path). */
function hasBearerAuth(req: Request): boolean {
  const h = req.headers.get('authorization')
  return !!h && h.toLowerCase().startsWith('bearer ')
}

/**
 * Returns true when the request is same-origin (or a direct user action) per
 * Sec-Fetch-Site, false when it's provably cross-site, and null when the
 * header is absent (caller falls back to Origin/Referer).
 */
function secFetchSiteOk(req: Request): boolean | null {
  const v = req.headers.get('sec-fetch-site')
  if (v === null) return null
  // 'none' = user typed the URL / bookmark; 'same-origin'/'same-site' = OK.
  return v === 'same-origin' || v === 'same-site' || v === 'none'
}

/** Compare an absolute Origin/Referer URL's host against the request target. */
function originHostMatches(req: Request, urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    const targetHost = req.headers.get('host')
    if (!targetHost) return false
    // Compare host (and, if both present, scheme). Origin carries scheme;
    // host-only comparison is sufficient for CSRF (the threat is a different
    // HOST submitting, not a protocol downgrade within the same host — HSTS
    // covers the latter).
    return u.host === targetHost
  } catch {
    return false
  }
}

/**
 * Enforce CSRF on a state-changing request. Returns null when the request is
 * allowed, or a 403 NextResponse when it's a cross-site forgery attempt.
 *
 * Usage in a route handler:
 *   const csrf = assertSameOrigin(request)
 *   if (csrf) return csrf
 */
export function assertSameOrigin(req: Request): NextResponse | null {
  // API-key requests are CSRF-exempt (see module doc).
  if (hasBearerAuth(req)) return null

  // Modern browsers send Sec-Fetch-Site — trust it when present.
  const sfs = secFetchSiteOk(req)
  if (sfs !== null) {
    return sfs ? null : NextResponse.json({ error: 'cross-site request blocked' }, { status: 403 })
  }

  // Fallback: Origin, then Referer.
  const origin = req.headers.get('origin')
  if (origin !== null) {
    return originHostMatches(req, origin)
      ? null
      : NextResponse.json({ error: 'cross-site request blocked' }, { status: 403 })
  }
  const referer = req.headers.get('referer')
  if (referer !== null) {
    return originHostMatches(req, referer)
      ? null
      : NextResponse.json({ error: 'cross-site request blocked' }, { status: 403 })
  }

  // No Origin, no Sec-Fetch-Site, no Referer. A same-origin browser fetch with
  // credentials always sends at least one of these; reject the ambiguous case.
  return NextResponse.json({ error: 'missing origin metadata' }, { status: 403 })
}
