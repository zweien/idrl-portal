import { cookies } from 'next/headers'
import { getIronSession, type SessionOptions } from 'iron-session'
import type { AuthProvider } from '@/lib/types'

/**
 * Session payload for the auth cookie.
 * - empty object = not logged in.
 * - userId references User.id (auth slice #1).
 */
export interface SessionData {
  userId?: string
  provider?: AuthProvider
  role?: 'admin' | 'member'
}

export const SESSION_COOKIE_NAME = 'idrl_session'

const DEV_SESSION_SECRET = 'idrl-portal-dev-session-secret-do-not-use-in-prod'

/**
 * Resolve the session signing secret. Production fails fast if SESSION_SECRET
 * is missing or too short; development falls back to a fixed value so local
 * setup needs no .env.
 */
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      throw new Error(
        'SESSION_SECRET environment variable is required in production. ' +
          'Generate one with: openssl rand -base64 32',
      )
    }
    if (secret.length < 32) {
      throw new Error(
        'SESSION_SECRET must be at least 32 characters (got ' +
          `${secret.length}). Generate one with: openssl rand -base64 32`,
      )
    }
    return secret
  }
  return secret && secret.length >= 32 ? secret : DEV_SESSION_SECRET
}

export const sessionOptions: SessionOptions = {
  password: getSessionSecret(),
  cookieName: SESSION_COOKIE_NAME,
  // Server-side expiry of the sealed payload. iron-session defaults to 14d,
  // which would let a copied cookie be replayed past the browser cookie
  // lifetime — keep ttl aligned with the cookie maxAge so both expire at 7d.
  ttl: 60 * 60 * 24 * 7, // 7 days
  cookieOptions: {
    httpOnly: true, // not readable by client JS
    sameSite: 'lax', // defend against CSRF on cross-site requests
    secure: process.env.NODE_ENV === 'production', // HTTPS-only in prod
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
}

/**
 * The iron-session object: payload fields PLUS .save()/.destroy() methods.
 * Callers read userId/provider/role, mutate, then call .save().
 */
export type Session = Awaited<ReturnType<typeof getIronSession<SessionData>>>

/**
 * Read the current session (server-side). Returns an empty Session object
 * when no session exists; callers check `session.userId` to determine auth
 * state. Mutate the returned object and call .save() to persist.
 */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions)
}

/**
 * Sign/persist a session payload to the response cookie (login / refresh).
 */
export async function saveSession(data: SessionData): Promise<void> {
  const session = await getSession()
  if (!data.userId) {
    session.destroy()
    return
  }
  session.userId = data.userId
  session.provider = data.provider
  session.role = data.role
  await session.save()
}

/**
 * Destroy the session (log out). Removes the cookie from the response.
 */
export async function destroySession(): Promise<void> {
  const session = await getSession()
  session.destroy()
}

