/**
 * Derive the portal's public origin from an incoming request, honoring proxy
 * headers (nginx sets X-Forwarded-Proto/Host).
 *
 * Use this — never `req.url` — when building absolute redirect targets:
 * behind a reverse proxy `req.url` reflects the server's own listen address
 * (http://localhost:<port>), not the public origin, so resolving redirects
 * against it sends users to localhost (observed in prod: after DingTalk
 * scan, callback redirected to https://localhost:3050/dashboard).
 */

import type { NextRequest } from 'next/server'

export function getRequestOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  if (proto && host) return `${proto}://${host}`
  return new URL(req.url).origin
}
