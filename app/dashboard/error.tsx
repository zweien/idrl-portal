'use client'

import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

/**
 * Dashboard error boundary. Keeps the sidebar nav intact and only replaces the
 * content area with a recovery UI, so a failed page doesn't kick the user out
 * of the dashboard shell.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <AlertTriangle className="h-10 w-10 text-[var(--status-absent)]" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">页面加载失败</h2>
        <p className="text-sm text-muted-foreground">
          数据加载时发生错误，请重试。
        </p>
        {process.env.NODE_ENV === 'development' && (
          <p className="mt-2 max-w-md rounded-md bg-muted p-2 text-left font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
        )}
      </div>
      <Button size="sm" onClick={reset}>重试</Button>
    </div>
  )
}
