'use client'

import { useLeaderboard, type LeaderboardEntry } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trophy, Clock, TrendingUp, Info } from 'lucide-react'
import { formatWorkHours } from '@/lib/attendance'
import { cn } from '@/lib/utils'

function rankClass(rank: number): string {
  if (rank === 0) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  if (rank === 1) return 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300'
  if (rank === 2) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
  return 'bg-muted text-muted-foreground'
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

export function LeaderboardPanel() {
  const { data: todayResp, isLoading: todayLoading } = useLeaderboard('today', 20)
  const { data: monthlyResp, isLoading: monthlyLoading } = useLeaderboard('monthly', 20)
  const today = todayResp?.data
  const monthly = monthlyResp?.data

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" />
            今日最早打卡 Top 20
            {today?.date && <span className="text-xs font-normal text-muted-foreground ml-auto">{today.date}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-0.5">
          {todayLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">加载中…</p>
          ) : !today || today.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <Info className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">今日数据将在首次同步后更新</p>
              <p className="text-xs text-muted-foreground/70">每天首次考勤同步后，本榜单自动生成</p>
            </div>
          ) : (
            today.items.map((e, i) => <Row key={e.personId} rank={i} entry={e} primary={e.checkIn ?? '—'} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" />
            本月工时排行 Top 20
            {monthly?.from && monthly.to && (
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                {monthly.from.slice(5)} ~ {monthly.to.slice(5)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-0.5">
          {monthlyLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">加载中…</p>
          ) : !monthly || monthly.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <Trophy className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">暂无数据</p>
              <p className="text-xs text-muted-foreground/70">次月同步后会显示本月累计工时</p>
            </div>
          ) : (
            monthly.items.map((e, i) => (
              <Row key={e.personId} rank={i} entry={e} primary={formatWorkHours(e.workMinutes ?? null)} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
