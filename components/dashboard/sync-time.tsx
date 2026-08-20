'use client'

import { useEffect, useState } from 'react'
import { useSyncedAt } from '@/lib/api'
import { useSWRConfig } from 'swr'

/**
 * "考勤同步于 x 分钟前" freshness badge for the personnel and attendance
 * pages. Member-readable: the underlying endpoint only exposes a timestamp +
 * status. Failed syncs render as a warning so stale data is obvious; a null
 * lastSyncAt (never synced) renders nothing.
 */
export function SyncTimeBadge({ className }: { className?: string }) {
  const { data } = useSyncedAt()
  // Local clock tick: the relative label must age ("刚刚" → "1 分钟前" → …)
  // even when SWR's revalidation returns an unchanged payload — SWR's deep
  // compare would skip re-rendering then. One tick per minute is the label's
  // granularity.
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const lastSyncAt = data?.data?.lastSyncAt
  const status = data?.data?.status
  if (!lastSyncAt) return null

  const rel = formatRelativeTime(lastSyncAt)
  const absolute = new Date(lastSyncAt).toLocaleString('zh-CN', { hour12: false })
  const failed = status === 'error'

  return (
    <span
      title={absolute}
      className={`inline-flex items-center gap-1 text-xs ${failed ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'} ${className ?? ''}`}
    >
      {failed ? '考勤同步失败' : '考勤同步于'} · {rel}
    </span>
  )
}

/**
 * Relative-time formatting for sync freshness: 刚刚 / x 分钟前 / x 小时前 /
 * x 天前. Exposed for unit tests. Uses minute granularity — sub-minute ages
 * read as "刚刚".
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()
  if (diffMs < 60_000) return '刚刚'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

/**
 * Invalidate the synced-at SWR key after a manual sync so the badge updates
 * immediately (used by the personnel page's 同步考勤 button).
 */
export function useInvalidateSyncedAt() {
  const { mutate } = useSWRConfig()
  return () => mutate('/api/attendance/synced-at')
}
