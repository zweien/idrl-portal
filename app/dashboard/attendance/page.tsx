'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { LeaderboardPanel } from '@/components/attendance/leaderboard-panel'
import { MyAttendancePanel } from '@/components/attendance/my-attendance-panel'
import { AllAttendancePanel } from '@/components/attendance/all-attendance-panel'
import { StickyPageHeader } from '@/components/dashboard/sticky-page-header'
import { SyncTimeBadge } from '@/components/dashboard/sync-time'
import { useAuth } from '@/lib/auth-context'

export default function AttendancePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState('leaderboard')

  return (
    <div className="space-y-4 py-2">
      <StickyPageHeader>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">考勤统计</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            每日打卡最早榜 · 月度工时排行 · 打卡明细
            <SyncTimeBadge className="ml-2 align-middle" />
          </p>
        </div>

        {/* 冻结行内只放 TabsList（受控 Tabs 的两个 root 共享同一 state），
            TabsContent 在下方随内容滚动 */}
        <Tabs value={tab} onValueChange={setTab} className="mt-3">
          <TabsList>
            <TabsTrigger value="leaderboard">榜单</TabsTrigger>
            <TabsTrigger value="mine">我的考勤</TabsTrigger>
            {isAdmin && <TabsTrigger value="all">全员明细</TabsTrigger>}
          </TabsList>
        </Tabs>
      </StickyPageHeader>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="leaderboard" className="mt-4">
          <LeaderboardPanel />
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <MyAttendancePanel />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="all" className="mt-4">
            <AllAttendancePanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
