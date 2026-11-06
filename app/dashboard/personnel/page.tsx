'use client'

import { useState, useMemo, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { FloorPlan } from '@/components/dashboard/floor-plan'
import { SyncTaskButton } from '@/components/dashboard/sync-task'
import { OffboardNotice } from '@/components/dashboard/offboard-notice'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { FloorTabs } from '@/components/dashboard/floor-tabs'
import { SyncTimeBadge, useInvalidateSyncedAt } from '@/components/dashboard/sync-time'
import { usePersonnel, useFloorLayout } from '@/lib/api'
import type { DepartedMember } from '@/lib/dingtalk-sync'
import type { Person, NewWorkstation } from '@/lib/types'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Search, MapPin, Mail, User, Settings, Clock, Plane } from 'lucide-react'
import { statusBg } from '@/lib/floor-constants'

const statusFilters = ['present', 'trip', 'leave', 'absent'] as const
const statusConfig = {
  present: { label: '在位', dot: 'status-dot-present', badge: 'bg-[var(--status-present)]/15 text-[var(--status-present)] border-[var(--status-present)]/30' },
  trip:    { label: '出差', dot: 'status-dot-trip',    badge: 'bg-[var(--status-trip)]/15 text-[var(--status-trip)] border-[var(--status-trip)]/30' },
  leave:   { label: '请假', dot: 'status-dot-leave',   badge: 'bg-[var(--status-leave)]/15 text-[var(--status-leave)] border-[var(--status-leave)]/30' },
  absent:  { label: '未到', dot: 'status-dot-absent',  badge: 'bg-[var(--status-absent)]/15 text-[var(--status-absent)] border-[var(--status-absent)]/30' },
}

export default function PersonnelPage() {
  const { user } = useAuth()
  const invalidateSyncedAt = useInvalidateSyncedAt()
  const { data: personnelResp, mutate: mutatePersonnel } = usePersonnel({ pageSize: 1000 })
  const { data: floorData, mutate: mutateFloorLayout } = useFloorLayout()
  const personnel = personnelResp?.data?.items ?? []
  const floors = floorData?.floors ?? []

  const [search, setSearch]                     = useState('')
  const [statusFilter, setStatusFilter]         = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson]     = useState<Person | null>(null)
  const [selectedWs, setSelectedWs]             = useState<NewWorkstation | null>(null)
  const [activeFloorId, setActiveFloorId]       = useState('')
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [departed, setDeparted]                 = useState<{ offboarded: DepartedMember[]; transferred: DepartedMember[] } | null>(null)
  useEffect(() => {
    if (!activeFloorId && floors.length > 0) setActiveFloorId(floors[0].id)
  }, [floors, activeFloorId])

  const activeFloor = useMemo(
    () => floors.find(f => f.id === activeFloorId) ?? floors[0],
    [floors, activeFloorId],
  )

  const filtered = useMemo(() => personnel.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.researchAreas?.some(a => a.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = !statusFilter || p.status === statusFilter
    return matchSearch && matchStatus
  }), [search, statusFilter, personnel])

  const counts = useMemo(() => ({
    present: personnel.filter(p => p.status === 'present').length,
    trip:    personnel.filter(p => p.status === 'trip').length,
    leave:   personnel.filter(p => p.status === 'leave').length,
    absent:  personnel.filter(p => p.status === 'absent').length,
  }), [personnel])

  // Crossing into the desktop breakpoint while the drawer is open would
  // leave lg:hidden content gone but the vaul overlay mounted — dimming and
  // blocking the desktop page. Close it on breakpoint entry.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setDetailDrawerOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const reinstateLogin = async (target: Person) => {
    await fetch(`/api/personnel/${target.id}/reinstate`, { method: 'POST' })
    // selectedPerson is an independent copy — refresh it from the
    // revalidated list or the panel keeps showing the stopped state.
    const fresh = await mutatePersonnel()
    const updated = fresh?.data?.items.find(x => x.id === target.id)
    if (updated) setSelectedPerson(updated)
  }

  // Mobile (<lg): the detail panel stacks below the floor plan, far out of
  // view — surface the selection in a bottom drawer instead. Desktop keeps
  // the persistent sidebar.
  const isDesktopViewport = () =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches

  const handleWsSelect = (ws: NewWorkstation, person?: Person) => {
    setSelectedWs(ws)
    setSelectedPerson(person ?? null)
    if (!isDesktopViewport()) setDetailDrawerOpen(true)
  }

  const handlePersonSelect = (person: Person) => {
    setSelectedPerson(person)
    if (!isDesktopViewport()) setDetailDrawerOpen(true)
    let found: NewWorkstation | null = null
    let foundFloorId: string | null = null
    for (const floor of floors) {
      for (const zone of floor.zones) {
        const ws = zone.workstations.find(w => w.personId === person.id)
        if (ws) { found = ws; foundFloorId = floor.id; break }
      }
      if (found) break
    }
    setSelectedWs(found)
    // Auto-switch to the floor where the workstation is, so the floor-plan
    // shows the highlighted workstation instead of staying on a wrong floor.
    if (foundFloorId) setActiveFloorId(foundFloorId)
  }

  if (!personnelResp || !floorData) {
    return (
      <div className="space-y-4 py-2">
        <h1 className="text-xl font-semibold tracking-tight">人员与工位</h1>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">人员与工位</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          查看实验室人员在位情况与工位分布
          <SyncTimeBadge className="ml-2 align-middle" />
        </p>
      </div>

      {departed && (departed.offboarded.length > 0 || departed.transferred.length > 0) && (
        <OffboardNotice
          offboarded={departed.offboarded}
          transferred={departed.transferred}
          onHandled={(handled) => {
            setDeparted(d => {
              if (!d) return d
              return {
                offboarded: d.offboarded.filter(m => m.id !== handled.id),
                transferred: d.transferred.filter(m => m.id !== handled.id),
              }
            })
            // Offboard freed the person's workstation in the DB — refresh the
            // floor plan cache and drop the stale selection so the plan stops
            // rendering it as occupied.
            void mutateFloorLayout()
            setSelectedWs(null)
            void mutatePersonnel()
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索姓名、邮箱、研究方向…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-64"
          />
        </div>
        <Button
          variant={statusFilter === null ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 text-xs"
          onClick={() => setStatusFilter(null)}
        >
          全部 ({personnel.length})
        </Button>
        {statusFilters.map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
          >
            <span className={cn('status-dot', statusConfig[s].dot)} />
            {statusConfig[s].label} ({counts[s]})
          </Button>
        ))}
        {user?.role === 'admin' && (
          <>
            <SyncTaskButton
              kind="members"
              label="同步钉钉成员"
              onDone={(task) => {
                const s = task.result?.stats as { offboarded?: DepartedMember[]; transferred?: DepartedMember[] } | undefined
                setDeparted({ offboarded: s?.offboarded ?? [], transferred: s?.transferred ?? [] })
                // The sync just created/updated people — refresh the board now
                // instead of waiting for a focus revalidation.
                void mutatePersonnel()
              }}
            />
            <SyncTaskButton
              kind="attendance"
              label="同步考勤"
              runningLabel="考勤同步中…"
              className="ml-auto"
              onDone={() => {
                // Revalidate personnel SWR so cards/status update immediately,
                // and the sync-freshness badge so "x 分钟前" reflects this run.
                void mutatePersonnel()
                invalidateSyncedAt()
              }}
            />
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
              <Link href="/dashboard/admin/floor-layout">
                <Settings className="h-3.5 w-3.5" />
                工位布局配置
              </Link>
            </Button>
          </>
        )}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">工位平面图</span>
            <div className="ml-auto">
              <FloorTabs
                floors={floors}
                activeFloorId={activeFloorId}
                onFloorChange={setActiveFloorId}
              />
            </div>
          </div>
          <div className="p-4">
            {activeFloor && (
              <FloorPlan
                floor={activeFloor}
                personnel={personnel}
                onSelectWorkstation={handleWsSelect}
                selectedWorkstationId={selectedWs?.id}
              />
            )}
          </div>
        </div>

        <div className="hidden lg:block rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">人员详情</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedPerson ? '选中人员信息' : '点击工位或人员卡片查看'}
            </p>
          </div>
          <div className="p-4">
            {selectedPerson ? (
              <PersonDetailBody person={selectedPerson} ws={selectedWs} onReinstate={reinstateLogin} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <User className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">选择工位或人员查看详情</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile (<lg): the sidebar panel is hidden, so surface the current
          selection here as a bottom drawer — desktop ignores this state. */}
      <Drawer open={detailDrawerOpen} onOpenChange={setDetailDrawerOpen}>
        <DrawerContent className="lg:hidden max-h-[85vh]">
          <div className="px-4 pb-6 overflow-y-auto">
            {selectedPerson ? (
              <PersonDetailBody person={selectedPerson} ws={selectedWs} onReinstate={reinstateLogin} />
            ) : selectedWs ? (
              <div className="space-y-2 text-sm py-2">
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">工位 {selectedWs.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">该工位当前未分配人员</p>
              </div>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium">人员列表</span>
          <span className="text-xs text-muted-foreground">
            {filtered.length} 人{search && ` · 搜索 "${search}"`}
          </span>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {filtered.map(person => {
            const isSelected = selectedPerson?.id === person.id
            return (
              <button
                key={person.id}
                onClick={() => handlePersonSelect(person)}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-md border text-left transition-colors w-full relative overflow-hidden',
                  isSelected
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:bg-accent hover:border-border'
                )}
              >
                <span className={cn('absolute left-0 top-0 bottom-0 w-1', statusBg[person.status])} />
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                    {person.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{person.name}</span>
                    {person.offboarded && (
                      <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground shrink-0">已停用</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={cn('inline-block h-1.5 w-1.5 rounded-full', statusBg[person.status])} />
                    <span className="text-[10px] text-muted-foreground">{statusConfig[person.status].label}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}


/**
 * Shared detail content for the person/workstation selection — rendered in
 * the desktop sidebar panel AND the mobile bottom drawer, so both surfaces
 * stay informationally identical (grilled decision Q4).
 */
function PersonDetailBody({
  person,
  ws,
  onReinstate,
}: {
  person: Person
  ws: NewWorkstation | null
  onReinstate: (p: Person) => Promise<void>
}) {
  const { user } = useAuth()
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
            {person.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{person.name}</p>
          <p className="text-xs text-muted-foreground">{person.role || '—'}</p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <Badge variant="outline" className={cn('text-xs font-medium gap-1.5 px-2 py-0.5 border', statusConfig[person.status].badge)}>
          <span className={cn('status-dot', statusConfig[person.status].dot)} />
          {statusConfig[person.status].label}
        </Badge>
        {person.lastSeen && person.status !== 'absent' && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>打卡 {person.lastSeen}</span>
          </div>
        )}
        {person.status === 'trip' && person.avatar && (
          <div className="flex items-start gap-2 text-muted-foreground">
            <Plane className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="text-xs">{person.avatar}</span>
          </div>
        )}
        {person.email && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{person.email}</span>
          </div>
        )}
        {person.offboarded && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5">
            <span className="text-xs text-muted-foreground">已停用（登录已禁用）</span>
            {user?.role === 'admin' && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[11px] px-2"
                onClick={() => onReinstate(person)}
              >
                恢复登录
              </Button>
            )}
          </div>
        )}
        {ws && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>工位 {ws.name}</span>
          </div>
        )}
      </div>

      {person.researchAreas && person.researchAreas.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">研究方向</p>
          <div className="flex flex-wrap gap-1.5">
            {person.researchAreas.map(area => (
              <Badge key={area} variant="secondary" className="text-xs font-normal">
                {area}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
