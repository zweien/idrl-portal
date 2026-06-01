'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useSidebar } from '@/lib/sidebar-context'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  LayoutDashboard,
  Users,
  Server,
  Newspaper,
  Settings,
  LogOut,
  Moon,
  Sun,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useState, useEffect } from 'react'

const navItems = [
  { href: '/dashboard',            label: '概览',     icon: LayoutDashboard },
  { href: '/dashboard/personnel',  label: '人员工位', icon: Users },
  { href: '/dashboard/resources',  label: '资源聚合', icon: Server },
  { href: '/dashboard/news',       label: '最新动态', icon: Newspaper },
  { href: '/dashboard/admin',      label: '信息管理', icon: Settings },
]

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const isDark = theme === 'dark'

  return (
    <Tooltip delayDuration={collapsed ? 0 : 300}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={cn(
            'rounded-md text-muted-foreground hover:text-foreground hover:bg-accent p-0',
            collapsed ? 'h-8 w-8' : 'h-8 w-8'
          )}
        >
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right" sideOffset={8}>
          {isDark ? '深色模式' : '浅色模式'}
        </TooltipContent>
      )}
    </Tooltip>
  )
}

export function DashboardNav() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { collapsed, toggle } = useSidebar()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <TooltipProvider delayDuration={collapsed ? 0 : 300}>
      {/* ── Desktop sidebar ─────────────────────────── */}
      <aside
        className={cn(
          'hidden lg:flex flex-col shrink-0 min-h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200 ease-out',
          collapsed ? 'w-14' : 'w-56'
        )}
      >
        {/* Wordmark */}
        <div className={cn(
          'flex items-center h-12 border-b border-sidebar-border transition-all duration-200',
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        )}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary-foreground leading-none">ID</span>
              </div>
              <span className="text-sm font-semibold tracking-tight">IDRL Portal</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard">
              <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary-foreground leading-none">ID</span>
              </div>
            </Link>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Nav items */}
        <nav className={cn('flex-1 px-2 py-3 space-y-0.5', collapsed && 'px-1.5')}>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center rounded-md text-sm transition-colors',
                      collapsed
                        ? 'justify-center px-0 py-2'
                        : 'gap-2.5 px-2.5 py-1.5',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                    )}
                  >
                    <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : '')} />
                    {!collapsed && item.label}
                  </Link>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            )
          })}
        </nav>

        {/* Bottom controls */}
        <div className={cn('px-2 py-3 border-t border-sidebar-border space-y-1', collapsed && 'px-1.5')}>
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between px-0.5')}>
            <ThemeToggle collapsed={collapsed} />
            {collapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggle}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  展开侧栏
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* User row */}
          {!collapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-sidebar-accent/60 transition-colors">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                      {user?.name?.charAt(0) ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-left text-sm font-medium truncate">
                    {user?.name ?? '用户'}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-44 mb-1 text-sm">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  {user?.role ?? 'member'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-3.5 w-3.5" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center w-full py-2 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                退出登录
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>

      {/* ── Mobile header ───────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between h-12 px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
              <span className="text-[10px] font-bold text-primary-foreground leading-none">ID</span>
            </div>
            <span className="text-sm font-semibold">IDRL Portal</span>
          </Link>

          <div className="flex items-center gap-1">
            <ThemeToggle collapsed={false} />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
            >
              {mobileOpen ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="px-3 pb-3 space-y-0.5 border-t border-border bg-background">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                >
                  <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : '')} />
                  {item.label}
                </Link>
              )
            })}
            <Separator className="my-1" />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              退出登录
            </button>
          </nav>
        )}
      </header>
    </TooltipProvider>
  )
}
