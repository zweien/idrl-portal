'use client'

import { useLeaderboard, type LeaderboardEntry } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Clock, TrendingUp, Info, Medal } from 'lucide-react'
import { formatWorkHours } from '@/lib/attendance'
import { cn } from '@/lib/utils'

// Podium styling for the top 3 (gold / silver / bronze).
const PODIUM = [
  { ring: 'ring-amber-400/60', chip: 'bg-amber-400 text-amber-950', glow: 'bg-amber-400/10', label: '金牌' },
  { ring: 'ring-slate-400/60', chip: 'bg-slate-400 text-slate-950', glow: 'bg-slate-400/10', label: '银牌' },
  { ring: 'ring-orange-400/60', chip: 'bg-orange-500 text-orange-950', glow: 'bg-orange-400/10', label: '铜牌' },
] as const

function rankClass(rank: number): string {
  if (rank === 0) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  if (rank === 1) return 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'
  if (rank === 2) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
  return 'bg-muted text-muted-foreground'
}

/** Highlighted podium card for ranks 1–3. */
function Podium({
  rank, entry, primary, primaryLabel,
}: {
  rank: number; entry: LeaderboardEntry; primary: React.ReactNode; primaryLabel: string
}) {
  const s = PODIUM[rank]
  return (
    <div className={cn(
      'relative flex flex-col items-center gap-2 rounded-lg ring-1 p-4 text-center overflow-hidden',
      s.ring, s.glow,
      // 1st place gets extra emphasis (taller + bolder).
      rank === 0 ? 'lg:-mt-2 lg:py-5' : '',
    )}>
      <div className={cn('absolute right-0 top-0 h-16 w-16 blur-2xl', s.glow)} />
      <div className={cn('inline-flex items-center justify-center h-9 w-9 rounded-full text-sm font-bold shadow-sm', s.chip)}>
        {rank + 1}
      </div>
      <span className="text-sm font-semibold truncate max-w-full">{entry.name}</span>
      <div className="flex flex-col items-center">
        <span className={cn('text-lg font-bold tabular-nums', rank === 0 ? 'text-xl' : '')}>{primary}</span>
        <span className="text-[10px] text-muted-foreground">{primaryLabel}</span>
      </div>
      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 border-transparent', s.chip, 'opacity-90')}>
        <Medal className="h-2.5 w-2.5 mr-0.5" />{s.label}
      </Badge>
    </div>
  )
}

function Row({ rank, entry, primary }: { rank: number; entry: LeaderboardEntry; primary: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent/50 transition-colors">
      <span className={cn('inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold shrink-0', rankClass(rank))}>
        {rank + 1}
      </span>
      <span className="text-sm font-medium truncate flex-1">{entry.name}</span>
      <span className="text-sm tabular-nums text-muted-foreground">{primary}</span>
    </div>
  )
}

/** Renders a leaderboard card: top-3 podium on top, ranks 4–20 as a compact list. */
function LeaderboardCard({
  icon, title, dateLabel, loading, empty, emptyIcon, items, formatPrimary, primaryLabel,
}: {
  icon: React.ReactNode; title: string; dateLabel?: React.ReactNode
  loading: boolean; empty: boolean; emptyIcon: React.ReactNode
  items: LeaderboardEntry[]
  formatPrimary: (e: LeaderboardEntry) => React.ReactNode
  primaryLabel: (e: LeaderboardEntry) => string
}) {
  const top3 = items.slice(0, 3)
  const rest = items.slice(3)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
          {dateLabel && <span className="text-xs font-normal text-muted-foreground ml-auto">{dateLabel}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">加载中…</p>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
            {emptyIcon}
            <p className="text-sm text-muted-foreground">今日数据将在首次同步后更新</p>
            <p className="text-xs text-muted-foreground/70">每天首次考勤同步后，本榜单自动生成</p>
          </div>
        ) : (
          <>
            {top3.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {top3.map((e, i) => (
                  <Podium key={e.personId} rank={i} entry={e} primary={formatPrimary(e)} primaryLabel={primaryLabel(e)} />
                ))}
              </div>
            )}
            {rest.length > 0 && (
              <div className="space-y-0.5 pt-1">
                {rest.map((e, i) => (
                  <Row key={e.personId} rank={i + 3} entry={e} primary={formatPrimary(e)} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function LeaderboardPanel() {
  const { data: todayResp, isLoading: todayLoading } = useLeaderboard('today', 20)
  const { data: monthlyResp, isLoading: monthlyLoading } = useLeaderboard('monthly', 20)
  const today = todayResp?.data
  const monthly = monthlyResp?.data

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <LeaderboardCard
        icon={<Clock className="h-4 w-4 text-primary" />}
        title="今日最早打卡 Top 20"
        dateLabel={today?.date}
        loading={todayLoading}
        empty={!today || today.items.length === 0}
        emptyIcon={<Info className="h-6 w-6 text-muted-foreground/40" />}
        items={today?.items ?? []}
        formatPrimary={e => e.checkIn ?? '—'}
        primaryLabel={() => '打卡时间'}
      />
      <LeaderboardCard
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
        title="本月工时排行 Top 20"
        dateLabel={monthly?.from && monthly.to ? `${monthly.from.slice(5)} ~ ${monthly.to.slice(5)}` : undefined}
        loading={monthlyLoading}
        empty={!monthly || monthly.items.length === 0}
        emptyIcon={<Trophy className="h-6 w-6 text-muted-foreground/40" />}
        items={monthly?.items ?? []}
        formatPrimary={e => formatWorkHours(e.workMinutes ?? null)}
        primaryLabel={() => '本月工时'}
      />
    </div>
  )
}
