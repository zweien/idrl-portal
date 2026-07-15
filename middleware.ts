import { NextResponse, type NextRequest } from 'next/server'
import { getSessionFromRequest, isAuthenticated, isAdmin } from '@/lib/session'

/**
 * Route protection:
 * - /dashboard/*        requires a logged-in session (else → /login)
 * - /dashboard/admin/*  additionally requires admin role (else → /dashboard)
 *
 * API routes are intentionally NOT matched here — they enforce auth
 * themselves via lib/auth-api (requireUser/requireAdmin), so they can
 * return proper 401/403 JSON instead of redirects.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const session = await getSessionFromRequest(req)
  const loggedIn = isAuthenticated(session)

  // Admin-only section
  if (pathname.startsWith('/dashboard/admin')) {
    if (!loggedIn) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    if (!isAdmin(session)) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // General dashboard (any authenticated user)
  if (!loggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  // Only run the protection on dashboard pages. Everything else (login,
  // API, static assets, _next internals) is public and excluded so the
  // matcher doesn't even invoke the middleware.
  matcher: ['/dashboard/:path*'],
}
