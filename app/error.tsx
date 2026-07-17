'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

/**
 * Root error boundary. Catches uncaught errors thrown during route rendering
 * and shows a recovery UI instead of a blank page. Must be a client component.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface to the browser console for debugging; production observability
    // can hook in here (e.g. Sentry).
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-[var(--status-absent)]" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">出错了</h2>
        <p className="text-sm text-muted-foreground">
          页面加载时发生错误。请重试，或刷新页面。
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
