'use client'

import { AuthProvider } from '@/lib/auth-context'
import { SidebarProvider } from '@/lib/sidebar-context'
import { DashboardNav } from '@/components/dashboard/nav'
import { cn } from '@/lib/utils'

function DashboardContent({ children }: { children: React.ReactNode }) {
  // NOTE: route protection lives in middleware.ts (server-side iron-session),
  // which is the single source of truth. The previous client-side
  // isAuthenticated gate read sessionStorage (the legacy mock-auth store),
  // which SSO logins never populate — it would bounce valid SSO sessions back
  // to /login. AuthProvider is retained for UI that reads `user` (e.g. the
  // admin-only button); authz is enforced by middleware.

  return (
    <div className="flex min-h-screen">
      <DashboardNav />
      <main className={cn(
        'flex-1 min-w-0 pt-12 lg:pt-0 transition-all duration-200 ease-out'
      )}>
        <div className="h-full p-4 lg:p-6 w-full max-w-[1600px]">
          {children}
        </div>
      </main>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <SidebarProvider>
        <DashboardContent>{children}</DashboardContent>
      </SidebarProvider>
    </AuthProvider>
  )
}
