'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const SIDEBAR_KEY = 'idrl_sidebar_collapsed'

interface SidebarContextType {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

function getInitial() {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(SIDEBAR_KEY) === 'true'
  } catch {
    return false
  }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(getInitial())
  }, [])

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev
      try { sessionStorage.setItem(SIDEBAR_KEY, String(next)) } catch {}
      return next
    })
  }

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider')
  return ctx
}
