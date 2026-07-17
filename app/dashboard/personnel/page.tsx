'use client'

import { useState, useMemo, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { FloorPlan } from '@/components/dashboard/floor-plan'
import { FloorTabs } from '@/components/dashboard/floor-tabs'
import { usePersonnel, useFloorLayout } from '@/lib/api'
import type { Person, NewWorkstation } from '@/lib/types'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Search, MapPin, Mail, User, Settings } from 'lucide-react'

const roleLabels: Record<Person['role'], string> = {
  professor:     '教授',
  postdoc:       '博士后',
  phd:           '博士生',
  master:        '硕士生',
  undergraduate: '本科生',
  staff:         '行政人员',
}

const statusConfig = {
  present: { label: '在位', dot: 'status-dot-present' },
  trip:    { label: '出差', dot: 'status-dot-trip' },
  leave:   { label: '请假', dot: 'status-dot-leave' },
  absent:  { label: '未到', dot: 'status-dot-absent' },
}

const statusFilters = ['present', 'trip', 'leave', 'absent'] as const

export default function PersonnelPage() {
  const { user } = useAuth()
  const { data: personnelResp } = usePersonnel({ pageSize: 1000 })
  const { data: floorData } = useFloorLayout()
  const personnel = personnelResp?.data?.items ?? []
  const floors = floorData?.floors ?? []

  const [search, setSearch]                     = useState('')
  const [statusFilter, setStatusFilter]         = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson]     = useState<Person | null>(null)
  const [selectedWs, setSelectedWs]             = useState<NewWorkstation | null>(null)
  const [activeFloorId, setActiveFloorId]       = useState('')

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

  const handleWsSelect = (ws: NewWorkstation, person?: Person) => {
    setSelectedWs(ws)
    setSelectedPerson(person ?? null)
  }

  const handlePersonSelect = (person: Person) => {
    setSelectedPerson(person)
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
        <p className="text-sm text-muted-foreground mt-0.5">查看实验室人员在位情况与工位分布</p>
      </div>

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
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 ml-auto" asChild>
            <Link href="/dashboard/admin/floor-layout">
              <Settings className="h-3.5 w-3.5" />
              工位布局配置
            </Link>
          </Button>
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

        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">人员详情</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedPerson ? '选中人员信息' : '点击工位或人员卡片查看'}
            </p>
          </div>
          <div className="p-4">
            {selectedPerson ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {selectedPerson.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{selectedPerson.name}</p>
                    <p className="text-xs text-muted-foreground">{roleLabels[selectedPerson.role]}</p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className={cn('status-dot', statusConfig[selectedPerson.status].dot)} />
                    <span>{statusConfig[selectedPerson.status].label}</span>
                  </div>
                  {selectedPerson.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{selectedPerson.email}</span>
                    </div>
                  )}
                  {selectedWs && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span>工位 {selectedWs.name}</span>
                    </div>
                  )}
                </div>

                {selectedPerson.researchAreas && selectedPerson.researchAreas.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">研究方向</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedPerson.researchAreas.map(area => (
                        <Badge key={area} variant="secondary" className="text-xs font-normal">
                          {area}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <User className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">选择工位或人员查看详情</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium">人员列表</span>
          <span className="text-xs text-muted-foreground">
            {filtered.length} 人{search && ` · 搜索 "${search}"`}
          </span>
        </div>
        <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {filtered.map(person => {
            const isSelected = selectedPerson?.id === person.id
            return (
              <button
                key={person.id}
                onClick={() => handlePersonSelect(person)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-md border text-left transition-colors w-full',
                  isSelected
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:bg-accent hover:border-border'
                )}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {person.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{person.name}</span>
                    <span className={cn('status-dot shrink-0', statusConfig[person.status].dot)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{roleLabels[person.role]}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
