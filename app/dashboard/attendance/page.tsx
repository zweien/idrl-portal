'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { LeaderboardPanel } from '@/components/attendance/leaderboard-panel'
import { MyAttendancePanel } from '@/components/attendance/my-attendance-panel'
import { AllAttendancePanel } from '@/components/attendance/all-attendance-panel'
import { useAuth } from '@/lib/auth-context'

export default function AttendancePage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState('leaderboard')

  return (
    <div className="space-y-4 py-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">考勤统计</h1>
        <p className="text-sm text-muted-foreground mt-0.5">每日打卡最早榜 · 月度工时排行 · 打卡明细</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="leaderboard">榜单</TabsTrigger>
          <TabsTrigger value="mine">我的考勤</TabsTrigger>
          {isAdmin && <TabsTrigger value="all">全员明细</TabsTrigger>}
        </TabsList>
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
