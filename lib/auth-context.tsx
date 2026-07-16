'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { LegacyUser, AuthState } from './types'
import { mockUser } from './mock-data'

const AUTH_STORAGE_KEY = 'idrl_auth'

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<boolean>
  loginWithSSO: (provider: 'authentik' | 'dingtalk') => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Helper to get initial state from sessionStorage
function getInitialState(): AuthState {
  if (typeof window === 'undefined') {
    return { user: null, isAuthenticated: false, isLoading: true }
  }
  
  try {
    const stored = sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { user: parsed.user, isAuthenticated: true, isLoading: false }
    }
  } catch (e) {
    // Ignore parse errors
  }
  
  return { user: null, isAuthenticated: false, isLoading: false }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true, // Start with loading true to check storage
  })

  // Check sessionStorage on mount (legacy mock-login path)
  useEffect(() => {
    const initial = getInitialState()
    setAuthState({ ...initial, isLoading: false })
  }, [])

  // Hydrate identity from the server-side session. SSO logins (Authentik /
  // DingTalk) only sign an iron-session cookie and never touch sessionStorage,
  // so the admin-only UI (which reads user.role) must learn the role from
  // /api/auth/me. Server session is authoritative; sessionStorage is only the
  // legacy dev-login fast path.
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { user?: { userId?: string; provider?: string; role?: 'admin' | 'member' } }) => {
        if (cancelled || !data?.user) return
        const serverUser: LegacyUser = {
          id: data.user.userId ?? 'sso',
          username: data.user.provider ?? 'sso',
          email: '',
          name: '',
          role: data.user.role ?? 'member',
        }
        setAuthState({ user: serverUser, isAuthenticated: true, isLoading: false })
      })
      .catch(() => { /* network/SSR errors are non-fatal here */ })
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true }))
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    let user: LegacyUser | null = null
    
    // Mock validation - in production, this would call your API
    if (username === 'admin' && password === 'admin') {
      user = mockUser as LegacyUser
    } else if (username && password) {
      // For demo, accept any non-empty credentials
      user = {
        id: 'demo',
        username,
        email: `${username}@idrl.edu.cn`,
        name: username,
        role: 'member',
      }
    }
    
    if (user) {
      // Store in sessionStorage for persistence across route groups
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user }))
      setAuthState({
        user,
        isAuthenticated: true,
        isLoading: false,
      })
      return true
    }
    
    setAuthState(prev => ({ ...prev, isLoading: false }))
    return false
  }, [])

  const loginWithSSO = useCallback(async (provider: 'authentik' | 'dingtalk'): Promise<boolean> => {
    setAuthState(prev => ({ ...prev, isLoading: true }))
    
    // Placeholder for SSO integration
    // In production, this would redirect to the SSO provider
    console.log(`SSO login with ${provider} - not yet implemented`)
    
    await new Promise(resolve => setTimeout(resolve, 500))
    setAuthState(prev => ({ ...prev, isLoading: false }))
    
    // Return false to indicate SSO is not yet configured
    return false
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY)
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })
  }, [])

  return (
    <AuthContext.Provider value={{ ...authState, login, loginWithSSO, logout }}>
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
