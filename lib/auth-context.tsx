'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { LegacyUser, AuthState } from './types'

/**
 * AuthProvider — client view of the server-side session.
 *
 * The single source of truth for authz is middleware.ts + the iron-session
 * cookie (server-side). This provider only mirrors the current user identity
 * for UI (e.g. the admin-only config button). There is NO client-side login
 * validation: SSO logins happen via full-page server redirects, and the dev
 * login form POSTs to /api/auth/dev-login. We hydrate `user` from
 * /api/auth/me on mount and after dev-login.
 */

interface AuthContextType extends AuthState {
  /** Dev-only: POST a username to /api/auth/dev-login, then re-hydrate. No-op in production. */
  devLogin: (username: string) => Promise<boolean>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  })

  // Hydrate identity from the server-side session. Server session is the only
  // authority; we never store/derive identity client-side.
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' })
      const data = (await r.json()) as { user?: { userId?: string; provider?: string; role?: 'admin' | 'member' } }
      if (data?.user) {
        const serverUser: LegacyUser = {
          id: data.user.userId ?? 'sso',
          username: data.user.provider ?? 'sso',
          email: '',
          name: '',
          role: data.user.role ?? 'member',
        }
        setAuthState({ user: serverUser, isAuthenticated: true, isLoading: false })
        return true
      }
    } catch {
      // network/SSR errors are non-fatal here
    }
    setAuthState({ user: null, isAuthenticated: false, isLoading: false })
    return false
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const devLogin = useCallback(async (username: string): Promise<boolean> => {
    if (process.env.NODE_ENV === 'production') return false
    setAuthState(prev => ({ ...prev, isLoading: true }))
    try {
      const r = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (!r.ok) {
        setAuthState(prev => ({ ...prev, isLoading: false }))
        return false
      }
    } catch {
      setAuthState(prev => ({ ...prev, isLoading: false }))
      return false
    }
    // re-hydrate from the server so role is authoritative
    await refresh()
    return true
  }, [refresh])

  const logout = useCallback(async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { /* best-effort */ }
    setAuthState({ user: null, isAuthenticated: false, isLoading: false })
  }, [])

  return (
    <AuthContext.Provider value={{ ...authState, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
