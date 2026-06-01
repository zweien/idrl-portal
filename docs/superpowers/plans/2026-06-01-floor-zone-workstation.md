# 工位布局灵活化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将固定四区域的工位平面图重构为多楼层、多区域的灵活展示系统，并提供管理员配置界面。

**Architecture:** 新增 Floor > Zone > Workstation 三层数据模型替换原有硬编码结构。重写 SVG 平面图组件支持动态区域布局、网格工位排列和滚动缩放。在管理员面板新增独立的工位布局编辑页面，左侧表单 + 右侧预览。

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Tabs, Button, Input, Label, Dialog, ScrollArea, Tooltip, Badge), SVG

---

## Task 1: 扩展类型定义

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: 在 `lib/types.ts` 中新增 Floor、Zone 类型，并扩展 Workstation**

在现有 `Workstation` 接口之后添加以下类型。保留原有 `Workstation` 接口不变（向后兼容），新增 `NewWorkstation` 接口用于新系统：

```typescript
// ============ Floor Layout ============
export interface Floor {
  id: string
  name: string
  order: number
  zones: Zone[]
}

export interface Zone {
  id: string
  name: string
  floorId: string
  color: string
  order: number
  rows: number
  cols: number
  workstations: NewWorkstation[]
}

export type WorkstationStatus = 'occupied' | 'empty' | 'maintenance'

export interface NewWorkstation {
  id: string
  name: string
  zoneId: string
  floorId: string
  row: number
  col: number
  personId?: string
  status: WorkstationStatus
}
```

注意：`Zone` 包含 `rows` 和 `cols` 字段，定义该区域的网格尺寸。`NewWorkstation` 使用 `row/col` 替代 `x/y`，使用 `zoneId/floorId` 替代 `zone`。

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add Floor, Zone, NewWorkstation types for multi-floor layout"
```

---

## Task 2: 新增 mock 数据

**Files:**
- Modify: `lib/mock-data.ts`

- [ ] **Step 1: 在 `lib/mock-data.ts` 中添加多楼层数据和辅助函数**

在文件末尾（`getWorkstationStats()` 之后）添加以下内容。**不修改**现有的 `mockWorkstations` 和 `mockPersonnel`（它们仍被其他页面引用）：

```typescript
// ============ Floor Layout Data ============
import type { Floor, NewWorkstation } from './types'

function generateWorkstations(zoneId: string, floorId: string, prefix: string, rows: number, cols: number, occupiedIds: string[] = []): NewWorkstation[] {
  const result: NewWorkstation[] = []
  let idx = 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const personId = occupiedIds.shift()
      result.push({
        id: `ws-${zoneId}-${idx}`,
        name: `${prefix}-${String(idx).padStart(2, '0')}`,
        zoneId,
        floorId,
        row: r,
        col: c,
        personId,
        status: personId ? 'occupied' : 'empty',
      })
      idx++
    }
  }
  return result
}

export const mockFloors: Floor[] = [
  {
    id: 'floor-9',
    name: '9层',
    order: 0,
    zones: [
      {
        id: 'zone-9a',
        name: '教授/博士后区',
        floorId: 'floor-9',
        color: 'oklch(0.65 0.18 260)',
        order: 0,
        rows: 2,
        cols: 3,
        workstations: generateWorkstations('zone-9a', 'floor-9', 'A', 2, 3, ['1', '2']),
      },
      {
        id: 'zone-9b',
        name: '博士生区',
        floorId: 'floor-9',
        color: 'oklch(0.65 0.18 145)',
        order: 1,
        rows: 3,
        cols: 6,
        workstations: generateWorkstations('zone-9b', 'floor-9', 'B', 3, 6, ['3', '4']),
      },
      {
        id: 'zone-9c',
        name: '硕士生区',
        floorId: 'floor-9',
        color: 'oklch(0.70 0.15 55)',
        order: 2,
        rows: 3,
        cols: 6,
        workstations: generateWorkstations('zone-9c', 'floor-9', 'C', 3, 6, ['5', '6']),
      },
    ],
  },
  {
    id: 'floor-10',
    name: '10层',
    order: 1,
    zones: [
      {
        id: 'zone-10a',
        name: '本科生/行政区',
        floorId: 'floor-10',
        color: 'oklch(0.65 0.15 300)',
        order: 0,
        rows: 2,
        cols: 4,
        workstations: generateWorkstations('zone-10a', 'floor-10', 'D', 2, 4, ['7', '8']),
      },
      {
        id: 'zone-10b',
        name: '会议/讨论区',
        floorId: 'floor-10',
        color: 'oklch(0.60 0.12 30)',
        order: 1,
        rows: 2,
        cols: 3,
        workstations: generateWorkstations('zone-10b', 'floor-10', 'E', 2, 3),
      },
    ],
  },
]
```

这创建了两个楼层（9层和10层），9层有三个区域（教授/博士后、博士生、硕士生），10层有两个区域（本科生/行政、会议/讨论区）。人员 ID 映射与现有 `mockPersonnel` 一致。

- [ ] **Step 2: Commit**

```bash
git add lib/mock-data.ts
git commit -m "feat(data): add multi-floor mock data with zone grid layout"
```

---

## Task 3: 重写 FloorPlan SVG 组件

**Files:**
- Modify: `components/dashboard/floor-plan.tsx`

- [ ] **Step 1: 完整重写 floor-plan.tsx**

用以下内容完全替换 `components/dashboard/floor-plan.tsx`。保留 `PersonnelStats` 导出（dashboard 主页可能引用）。新组件接收 `Floor` 对象，渲染多区域 SVG 布局，支持滚动和缩放：

```tsx
'use client'

import { useState, useMemo, useCallback } from 'react'
import { mockPersonnel } from '@/lib/mock-data'
import type { Floor, NewWorkstation, Person } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { ZoomIn, ZoomOut } from 'lucide-react'

const CELL_W = 70
const CELL_H = 50
const CELL_GAP = 6
const ZONE_PAD = 16
const ZONE_TITLE_H = 24
const ZONE_GAP_X = 20
const ZONE_GAP_Y = 20
const ZONES_PER_ROW = 3

const statusColors: Record<string, string> = {
  online: 'fill-[oklch(0.7_0.2_145)]',
  offline: 'fill-[oklch(0.4_0.02_260)]',
  busy: 'fill-[oklch(0.65_0.2_45)]',
  leave: 'fill-[oklch(0.5_0.15_300)]',
}

const statusLabels: Record<string, string> = {
  online: '在位',
  offline: '离开',
  busy: '忙碌',
  leave: '请假',
}

interface ZoneLayout {
  id: string
  name: string
  color: string
  x: number
  y: number
  width: number
  height: number
  wsPositions: Array<{
    ws: NewWorkstation
    person?: Person
    x: number
    y: number
  }>
}

function layoutZones(floor: Floor): { zones: ZoneLayout[]; svgW: number; svgH: number } {
  const sorted = [...floor.zones].sort((a, b) => a.order - b.order)
  const zones: ZoneLayout[] = []

  let curX = ZONE_GAP_X
  let curY = ZONE_GAP_Y
  let rowMaxH = 0

  for (const zone of sorted) {
    const zoneW = ZONE_PAD * 2 + zone.cols * (CELL_W + CELL_GAP) - CELL_GAP
    const zoneH = ZONE_TITLE_H + ZONE_PAD + zone.rows * (CELL_H + CELL_GAP) - CELL_GAP + ZONE_PAD

    // wrap to next row
    if (curX + zoneW + ZONE_GAP_X > ZONES_PER_ROW * (200 + ZONE_GAP_X) && curX > ZONE_GAP_X) {
      curY += rowMaxH + ZONE_GAP_Y
      curX = ZONE_GAP_X
      rowMaxH = 0
    }

    const wsPositions = zone.workstations.map(ws => ({
      ws,
      person: ws.personId ? mockPersonnel.find(p => p.id === ws.personId) : undefined,
      x: curX + ZONE_PAD + ws.col * (CELL_W + CELL_GAP),
      y: curY + ZONE_TITLE_H + ZONE_PAD + ws.row * (CELL_H + CELL_GAP),
    }))

    zones.push({
      id: zone.id,
      name: zone.name,
      color: zone.color,
      x: curX,
      y: curY,
      width: zoneW,
      height: zoneH,
      wsPositions,
    })

    curX += zoneW + ZONE_GAP_X
    rowMaxH = Math.max(rowMaxH, zoneH)
  }

  const svgW = Math.max(400, ...zones.map(z => z.x + z.width + ZONE_GAP_X))
  const svgH = Math.max(300, ...zones.map(z => z.y + z.height + ZONE_GAP_Y))

  return { zones, svgW, svgH }
}

interface FloorPlanProps {
  floor: Floor
  onSelectWorkstation?: (workstation: NewWorkstation, person?: Person) => void
  selectedWorkstationId?: string
  readOnly?: boolean
}

export function FloorPlan({ floor, onSelectWorkstation, selectedWorkstationId, readOnly }: FloorPlanProps) {
  const [hoveredWs, setHoveredWs] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  const { zones, svgW, svgH } = useMemo(() => layoutZones(floor), [floor])

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.15, 2)))
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.15, 0.4)))

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative">
        {/* Zoom controls */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-card/80 backdrop-blur-sm border border-border rounded-md p-0.5">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomOut}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleZoomIn}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ScrollArea className="h-[600px] w-full rounded-md">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', minWidth: svgW * zoom }}>
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              width={svgW}
              height={svgH}
              className="select-none"
            >
              {/* Background grid */}
              <defs>
                <pattern id="grid-floor" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border/30" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-floor)" />

              {/* Zones */}
              {zones.map(zone => (
                <g key={zone.id}>
                  {/* Zone background */}
                  <rect
                    x={zone.x}
                    y={zone.y}
                    width={zone.width}
                    height={zone.height}
                    rx="8"
                    fill="none"
                    stroke={zone.color}
                    strokeWidth="2"
                    strokeDasharray="6 3"
                    opacity="0.6"
                  />
                  {/* Zone title */}
                  <text
                    x={zone.x + ZONE_PAD}
                    y={zone.y + ZONE_TITLE_H - 4}
                    className="fill-muted-foreground text-[12px] font-medium"
                  >
                    {zone.name}
                  </text>

                  {/* Workstations */}
                  {zone.wsPositions.map(({ ws, person, x, y }) => {
                    const isSelected = selectedWorkstationId === ws.id
                    const isHovered = hoveredWs === ws.id
                    const isOccupied = !!ws.personId

                    return (
                      <Tooltip key={ws.id}>
                        <TooltipTrigger asChild>
                          <g
                            className={cn(!readOnly && 'cursor-pointer', 'transition-all duration-200')}
                            onMouseEnter={() => setHoveredWs(ws.id)}
                            onMouseLeave={() => setHoveredWs(null)}
                            onClick={() => {
                              if (!readOnly) onSelectWorkstation?.(ws, person)
                            }}
                          >
                            {/* Desk */}
                            <rect
                              x={x}
                              y={y}
                              width={CELL_W}
                              height={CELL_H}
                              rx="6"
                              className={cn(
                                'transition-all duration-200',
                                isOccupied ? 'fill-card' : 'fill-muted/30',
                                isSelected && 'stroke-primary stroke-2',
                                isHovered && !isSelected && 'stroke-primary/50 stroke-1',
                              )}
                              stroke={isOccupied ? 'currentColor' : undefined}
                              strokeWidth={isOccupied ? 0.5 : 0}
                              style={{ stroke: isOccupied ? 'var(--color-border)' : undefined }}
                            />

                            {/* Empty workstation dashed border */}
                            {!isOccupied && (
                              <rect
                                x={x + 1}
                                y={y + 1}
                                width={CELL_W - 2}
                                height={CELL_H - 2}
                                rx="5"
                                fill="none"
                                className="stroke-muted-foreground/30"
                                strokeWidth="1"
                                strokeDasharray="4 3"
                              />
                            )}

                            {/* Status indicator */}
                            {person && (
                              <circle
                                cx={x + CELL_W - 10}
                                cy={y + 10}
                                r="5"
                                className={cn(statusColors[person.status])}
                              />
                            )}

                            {/* Workstation name */}
                            <text
                              x={x + CELL_W / 2}
                              y={y + (isOccupied ? 24 : CELL_H / 2 + 4)}
                              textAnchor="middle"
                              className={cn(
                                'text-[11px] font-medium pointer-events-none',
                                isOccupied ? 'fill-foreground' : 'fill-muted-foreground/60',
                              )}
                            >
                              {ws.name}
                            </text>

                            {/* Person name */}
                            {person && (
                              <text
                                x={x + CELL_W / 2}
                                y={y + 40}
                                textAnchor="middle"
                                className="fill-muted-foreground text-[10px] pointer-events-none"
                              >
                                {person.name}
                              </text>
                            )}
                          </g>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <div className="space-y-1">
                            <p className="font-medium">{ws.name}</p>
                            {person ? (
                              <>
                                <p className="text-sm">{person.name}</p>
                                <Badge variant="outline" className="text-xs">
                                  {statusLabels[person.status] ?? '未知'}
                                </Badge>
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">空闲工位</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )
                  })}
                </g>
              ))}

              {/* Legend */}
              <g transform={`translate(${svgW - 90}, ${svgH - 70})`}>
                <text x="0" y="0" className="fill-muted-foreground text-[10px] font-medium">状态图例</text>
                {Object.entries(statusLabels).map(([status, label], i) => (
                  <g key={status} transform={`translate(0, ${15 + i * 14})`}>
                    <circle cx="6" cy="0" r="4" className={statusColors[status]} />
                    <text x="16" y="3" className="fill-muted-foreground text-[9px]">{label}</text>
                  </g>
                ))}
              </g>
            </svg>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  )
}

// Keep PersonnelStats export for dashboard homepage
export { default as PersonnelStats } from './personnel-stats'
```

注意：`PersonnelStats` 原来定义在 `floor-plan.tsx` 中。因为重写后不再包含它，需要把它拆到单独文件。这一步创建 `components/dashboard/personnel-stats.tsx`。

- [ ] **Step 2: 创建 `components/dashboard/personnel-stats.tsx`**

将原来 `floor-plan.tsx` 中的 `PersonnelStats` 组件提取到独立文件：

```tsx
'use client'

import { useMemo } from 'react'
import { mockPersonnel } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

export default function PersonnelStats() {
  const stats = useMemo(() => {
    const total = mockPersonnel.length
    const online = mockPersonnel.filter(p => p.status === 'online').length
    const busy = mockPersonnel.filter(p => p.status === 'busy').length
    const offline = mockPersonnel.filter(p => p.status === 'offline').length
    const leave = mockPersonnel.filter(p => p.status === 'leave').length

    return [
      { label: '总人数', value: total, color: 'text-foreground' },
      { label: '在位', value: online, color: 'text-[oklch(0.7_0.2_145)]' },
      { label: '忙碌', value: busy, color: 'text-[oklch(0.65_0.2_45)]' },
      { label: '离开', value: offline, color: 'text-muted-foreground' },
      { label: '请假', value: leave, color: 'text-[oklch(0.5_0.15_300)]' },
    ]
  }, [])

  return (
    <div className="flex flex-wrap gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-2">
          <span className={cn('text-2xl font-bold', stat.color)}>{stat.value}</span>
          <span className="text-sm text-muted-foreground">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 检查 PersonnelStats 的引用方并更新导入**

检查 `PersonnelStats` 是否在 `app/dashboard/page.tsx` 中被引用。如果是，更新导入路径：

```bash
grep -rn "PersonnelStats" app/ components/ --include="*.tsx" --include="*.ts"
```

如果有引用，将导入改为 `import { PersonnelStats } from '@/components/dashboard/personnel-stats'`。

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/floor-plan.tsx components/dashboard/personnel-stats.tsx
git commit -m "feat(floor-plan): rewrite SVG component with multi-zone grid layout, scroll & zoom"
```

---

## Task 4: 新增 FloorTabs 组件

**Files:**
- Create: `components/dashboard/floor-tabs.tsx`

- [ ] **Step 1: 创建楼层标签切换组件**

```tsx
'use client'

import type { Floor } from '@/lib/types'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface FloorTabsProps {
  floors: Floor[]
  activeFloorId: string
  onFloorChange: (floorId: string) => void
}

export function FloorTabs({ floors, activeFloorId, onFloorChange }: FloorTabsProps) {
  const sorted = [...floors].sort((a, b) => a.order - b.order)

  return (
    <Tabs value={activeFloorId} onValueChange={onFloorChange}>
      <TabsList className="h-9 p-1">
        {sorted.map(floor => (
          <TabsTrigger key={floor.id} value={floor.id} className="text-xs h-7 px-4">
            {floor.name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/floor-tabs.tsx
git commit -m "feat: add FloorTabs component for floor switching"
```

---

## Task 5: 改造人员工位页面

**Files:**
- Modify: `app/dashboard/personnel/page.tsx`

- [ ] **Step 1: 改造 personnel/page.tsx 集成楼层标签和新平面图**

将文件内容替换为以下代码。核心变化：
1. 导入 `mockFloors` 替代 `mockWorkstations`
2. 添加楼层状态和标签切换
3. 传递 `floor` 对象给 `FloorPlan` 组件
4. 使用 `NewWorkstation` 类型替代 `Workstation`

```tsx
'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { FloorPlan } from '@/components/dashboard/floor-plan'
import { FloorTabs } from '@/components/dashboard/floor-tabs'
import { mockPersonnel, mockFloors } from '@/lib/mock-data'
import type { Person, NewWorkstation } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Search, MapPin, Mail, User } from 'lucide-react'

const roleLabels: Record<Person['role'], string> = {
  professor:     '教授',
  postdoc:       '博士后',
  phd:           '博士生',
  master:        '硕士生',
  undergraduate: '本科生',
  staff:         '行政人员',
}

const statusConfig = {
  online:  { label: '在位', dot: 'status-dot-online' },
  offline: { label: '离开', dot: 'status-dot-offline' },
  busy:    { label: '忙碌', dot: 'status-dot-busy' },
  leave:   { label: '请假', dot: 'status-dot-leave' },
}

const statusFilters = ['online', 'offline', 'busy', 'leave'] as const

export default function PersonnelPage() {
  const [search, setSearch]                     = useState('')
  const [statusFilter, setStatusFilter]         = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson]     = useState<Person | null>(null)
  const [selectedWs, setSelectedWs]             = useState<NewWorkstation | null>(null)
  const [activeFloorId, setActiveFloorId]       = useState(mockFloors[0]?.id ?? '')

  const activeFloor = useMemo(
    () => mockFloors.find(f => f.id === activeFloorId) ?? mockFloors[0],
    [activeFloorId],
  )

  const filtered = useMemo(() => mockPersonnel.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.researchAreas?.some(a => a.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = !statusFilter || p.status === statusFilter
    return matchSearch && matchStatus
  }), [search, statusFilter])

  const counts = useMemo(() => ({
    online:  mockPersonnel.filter(p => p.status === 'online').length,
    offline: mockPersonnel.filter(p => p.status === 'offline').length,
    busy:    mockPersonnel.filter(p => p.status === 'busy').length,
    leave:   mockPersonnel.filter(p => p.status === 'leave').length,
  }), [])

  const handleWsSelect = (ws: NewWorkstation, person?: Person) => {
    setSelectedWs(ws)
    setSelectedPerson(person ?? null)
  }

  const handlePersonSelect = (person: Person) => {
    setSelectedPerson(person)
    // Find workstation across all floors for this person
    let found: NewWorkstation | null = null
    for (const floor of mockFloors) {
      for (const zone of floor.zones) {
        const ws = zone.workstations.find(w => w.personId === person.id)
        if (ws) { found = ws; break }
      }
      if (found) break
    }
    setSelectedWs(found)
  }

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">人员与工位</h1>
        <p className="text-sm text-muted-foreground mt-0.5">查看实验室人员在位情况与工位分布</p>
      </div>

      {/* Filter bar */}
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
          全部 ({mockPersonnel.length})
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
      </div>

      {/* Content */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Floor plan */}
        <div className="lg:col-span-2 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">工位平面图</span>
            <div className="ml-auto">
              <FloorTabs
                floors={mockFloors}
                activeFloorId={activeFloorId}
                onFloorChange={setActiveFloorId}
              />
            </div>
          </div>
          <div className="p-4">
            {activeFloor && (
              <FloorPlan
                floor={activeFloor}
                onSelectWorkstation={handleWsSelect}
                selectedWorkstationId={selectedWs?.id}
              />
            )}
          </div>
        </div>

        {/* Detail panel */}
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

      {/* Personnel list */}
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
```

- [ ] **Step 2: 检查 dashboard 主页是否引用了旧的 FloorPlan 或 PersonnelStats**

```bash
grep -rn "FloorPlan\|PersonnelStats\|mockWorkstations" app/dashboard/page.tsx
```

如果 `app/dashboard/page.tsx` 引用了旧的 `FloorPlan`（不带 `floor` 参数），需要适配。检查后更新导入和调用方式。

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/personnel/page.tsx
git commit -m "feat(personnel): integrate floor tabs and new multi-zone floor plan"
```

---

## Task 6: 适配 dashboard 主页

**Files:**
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: 检查并更新 dashboard 主页**

读取 `app/dashboard/page.tsx`，检查是否有对 `FloorPlan`、`PersonnelStats`、`mockWorkstations` 的引用。如果有：

1. 如果引用了 `PersonnelStats` → 更新导入为 `import { PersonnelStats } from '@/components/dashboard/personnel-stats'`
2. 如果引用了 `FloorPlan` → 传递默认楼层：`<FloorPlan floor={mockFloors[0]} readOnly />`
3. 如果引用了 `mockWorkstations` → 替换为从 `mockFloors` 获取数据的逻辑

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "fix(dashboard): adapt homepage for new FloorPlan interface"
```

---

## Task 7: 新增管理员工位布局编辑页

**Files:**
- Create: `app/dashboard/admin/floor-layout/page.tsx`
- Create: `components/admin/floor-editor.tsx`
- Create: `components/admin/floor-preview.tsx`

- [ ] **Step 1: 创建 `components/admin/floor-editor.tsx`**

这是编辑器的左栏，管理楼层/区域/工位配置。所有状态提升到父组件，通过 props 回调：

```tsx
'use client'

import { useState } from 'react'
import type { Floor } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'

interface FloorEditorProps {
  floors: Floor[]
  onChange: (floors: Floor[]) => void
}

let nextId = 100
function genId(prefix: string) {
  return `${prefix}-${nextId++}`
}

export function FloorEditor({ floors, onChange }: FloorEditorProps) {
  const [selectedFloorId, setSelectedFloorId] = useState<string>(floors[0]?.id ?? '')
  const [selectedZoneId, setSelectedZoneId] = useState<string>('')
  const [newFloorName, setNewFloorName] = useState('')
  const [newZoneName, setNewZoneName] = useState('')

  const selectedFloor = floors.find(f => f.id === selectedFloorId)
  const selectedZone = selectedFloor?.zones.find(z => z.id === selectedZoneId)

  const updateFloors = (updater: (floors: Floor[]) => Floor[]) => {
    onChange(updater(floors))
  }

  // ── Floor operations ──
  const addFloor = () => {
    if (!newFloorName.trim()) return
    const id = genId('floor')
    const newFloor: Floor = {
      id,
      name: newFloorName.trim(),
      order: floors.length,
      zones: [],
    }
    updateFloors(f => [...f, newFloor])
    setSelectedFloorId(id)
    setSelectedZoneId('')
    setNewFloorName('')
  }

  const removeFloor = (floorId: string) => {
    updateFloors(f => f.filter(fl => fl.id !== floorId))
    if (selectedFloorId === floorId) {
      const remaining = floors.filter(f => f.id !== floorId)
      setSelectedFloorId(remaining[0]?.id ?? '')
      setSelectedZoneId('')
    }
  }

  const moveFloor = (floorId: string, direction: -1 | 1) => {
    updateFloors(f => {
      const idx = f.findIndex(fl => fl.id === floorId)
      if (idx < 0) return f
      const swapIdx = idx + direction
      if (swapIdx < 0 || swapIdx >= f.length) return f
      const copy = [...f]
      const tmp = copy[idx].order
      copy[idx] = { ...copy[idx], order: copy[swapIdx].order }
      copy[swapIdx] = { ...copy[swapIdx], order: tmp }
      return copy.sort((a, b) => a.order - b.order)
    })
  }

  // ── Zone operations ──
  const addZone = () => {
    if (!selectedFloor || !newZoneName.trim()) return
    const id = genId('zone')
    const newZone = {
      id,
      name: newZoneName.trim(),
      floorId: selectedFloor.id,
      color: `oklch(0.65 0.15 ${Math.floor(Math.random() * 360)})`,
      order: selectedFloor.zones.length,
      rows: 2,
      cols: 3,
      workstations: [],
    }
    updateFloors(f =>
      f.map(fl => fl.id === selectedFloor.id
        ? { ...fl, zones: [...fl.zones, newZone] }
        : fl,
      ),
    )
    setSelectedZoneId(id)
    setNewZoneName('')
  }

  const removeZone = (zoneId: string) => {
    if (!selectedFloor) return
    updateFloors(f =>
      f.map(fl => fl.id === selectedFloor.id
        ? { ...fl, zones: fl.zones.filter(z => z.id !== zoneId) }
        : fl,
      ),
    )
    if (selectedZoneId === zoneId) setSelectedZoneId('')
  }

  // ── Zone grid settings ──
  const updateZoneGrid = (rows: number, cols: number) => {
    if (!selectedFloor || !selectedZone) return
    updateFloors(f =>
      f.map(fl => fl.id === selectedFloor.id
        ? {
            ...fl,
            zones: fl.zones.map(z => {
              if (z.id !== selectedZone.id) return z
              // Regenerate workstations for new grid
              const ws: typeof z.workstations = []
              let idx = 1
              for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                  const existing = z.workstations.find(w => w.row === r && w.col === c)
                  ws.push(existing ?? {
                    id: genId(`ws-${z.id}`),
                    name: `${z.name.charAt(0)}-${String(idx).padStart(2, '0')}`,
                    zoneId: z.id,
                    floorId: fl.id,
                    row: r,
                    col: c,
                    status: 'empty' as const,
                  })
                  idx++
                }
              }
              return { ...z, rows, cols, workstations: ws }
            }),
          }
        : fl,
      ),
    )
  }

  const sortedFloors = [...floors].sort((a, b) => a.order - b.order)
  const sortedZones = selectedFloor
    ? [...selectedFloor.zones].sort((a, b) => a.order - b.order)
    : []

  return (
    <div className="space-y-5">
      {/* Floor management */}
      <section>
        <h3 className="text-sm font-medium mb-2">楼层管理</h3>
        <div className="space-y-1.5">
          {sortedFloors.map(floor => (
            <div
              key={floor.id}
              className={cn(
                'flex items-center gap-2 p-2 rounded-md border text-sm cursor-pointer transition-colors',
                selectedFloorId === floor.id
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border hover:bg-accent',
              )}
              onClick={() => { setSelectedFloorId(floor.id); setSelectedZoneId('') }}
            >
              <span className="flex-1 font-medium">{floor.name}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); moveFloor(floor.id, -1) }}>
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); moveFloor(floor.id, 1) }}>
                <ChevronDown className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); removeFloor(floor.id) }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="楼层名称"
            value={newFloorName}
            onChange={e => setNewFloorName(e.target.value)}
            className="h-8 text-sm"
            onKeyDown={e => e.key === 'Enter' && addFloor()}
          />
          <Button size="sm" className="h-8 gap-1" onClick={addFloor} disabled={!newFloorName.trim()}>
            <Plus className="h-3.5 w-3.5" />添加
          </Button>
        </div>
      </section>

      {/* Zone management */}
      {selectedFloor && (
        <section>
          <h3 className="text-sm font-medium mb-2">区域管理 · {selectedFloor.name}</h3>
          <div className="space-y-1.5">
            {sortedZones.map(zone => (
              <div
                key={zone.id}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-md border text-sm cursor-pointer transition-colors',
                  selectedZoneId === zone.id
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border hover:bg-accent',
                )}
                onClick={() => setSelectedZoneId(zone.id)}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: zone.color }} />
                <span className="flex-1">{zone.name}</span>
                <span className="text-xs text-muted-foreground">{zone.rows}×{zone.cols}</span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); removeZone(zone.id) }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="区域名称"
              value={newZoneName}
              onChange={e => setNewZoneName(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={e => e.key === 'Enter' && addZone()}
            />
            <Button size="sm" className="h-8 gap-1" onClick={addZone} disabled={!newZoneName.trim()}>
              <Plus className="h-3.5 w-3.5" />添加
            </Button>
          </div>
        </section>
      )}

      {/* Grid settings */}
      {selectedZone && (
        <section>
          <h3 className="text-sm font-medium mb-2">工位设置 · {selectedZone.name}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">行数</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={selectedZone.rows}
                onChange={e => updateZoneGrid(Number(e.target.value) || 1, selectedZone.cols)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">列数</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={selectedZone.cols}
                onChange={e => updateZoneGrid(selectedZone.rows, Number(e.target.value) || 1)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            将生成 {selectedZone.rows} × {selectedZone.cols} = {selectedZone.rows * selectedZone.cols} 个工位
          </p>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 `components/admin/floor-preview.tsx`**

```tsx
'use client'

import type { Floor } from '@/lib/types'
import { FloorPlan } from '@/components/dashboard/floor-plan'

interface FloorPreviewProps {
  floor: Floor | undefined
}

export function FloorPreview({ floor }: FloorPreviewProps) {
  if (!floor) {
    return (
      <div className="flex items-center justify-center h-[400px] text-sm text-muted-foreground">
        请选择楼层查看预览
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 text-sm font-medium text-muted-foreground">
        预览 · {floor.name}
      </div>
      <FloorPlan floor={floor} readOnly />
    </div>
  )
}
```

- [ ] **Step 3: 创建 `app/dashboard/admin/floor-layout/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { FloorEditor } from '@/components/admin/floor-editor'
import { FloorPreview } from '@/components/admin/floor-preview'
import { mockFloors } from '@/lib/mock-data'
import type { Floor } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { ShieldAlert, Save } from 'lucide-react'

export default function FloorLayoutPage() {
  const { user } = useAuth()
  const [floors, setFloors] = useState<Floor[]>(mockFloors)
  const [selectedFloorId] = useState(floors[0]?.id ?? '')

  const previewFloor = floors.find(f => f.id === selectedFloorId) ?? floors[0]

  if (user?.role !== 'admin') {
    return (
      <div className="space-y-4 py-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">工位布局管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">配置楼层、区域和工位</p>
        </div>
        <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center py-16 text-center gap-3">
          <ShieldAlert className="h-8 w-8 text-muted-foreground/50" />
          <div>
            <p className="font-medium">访问受限</p>
            <p className="text-sm text-muted-foreground mt-0.5">您需要管理员权限才能访问此页面</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">工位布局管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">配置楼层、区域和工位</p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5">
          <Save className="h-3.5 w-3.5" />保存配置
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Left: Editor */}
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">配置编辑</p>
            <p className="text-xs text-muted-foreground mt-0.5">添加楼层、区域，设置工位行列数</p>
          </div>
          <div className="p-4">
            <FloorEditor floors={floors} onChange={setFloors} />
          </div>
        </div>

        {/* Right: Preview */}
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">实时预览</p>
            <p className="text-xs text-muted-foreground mt-0.5">配置变更即时反映到平面图</p>
          </div>
          <div className="p-4">
            <FloorPreview floor={previewFloor} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/admin/floor-layout/page.tsx components/admin/floor-editor.tsx components/admin/floor-preview.tsx
git commit -m "feat(admin): add floor layout editor with live preview"
```

---

## Task 8: 在管理员页面添加"工位布局"入口

**Files:**
- Modify: `app/dashboard/admin/page.tsx`

- [ ] **Step 1: 在管理员 Tabs 中添加"工位布局"标签**

在 `app/dashboard/admin/page.tsx` 的 `<Tabs>` 组件中，在现有三个 `TabsTrigger`（人员管理、资源管理、动态管理）之后添加一个新的标签：

```tsx
<TabsTrigger value="floor-layout" className="text-xs gap-1.5 h-7">
  <MapPin className="h-3.5 w-3.5" />工位布局
</TabsTrigger>
```

并添加对应的 `TabsContent`：

```tsx
<TabsContent value="floor-layout" className="mt-3">
  <div className="rounded-lg border border-border bg-card">
    <div className="px-4 py-3 border-b border-border">
      <p className="text-sm font-medium">工位布局管理</p>
      <p className="text-xs text-muted-foreground mt-0.5">配置楼层、区域和工位布局</p>
    </div>
    <div className="p-4">
      <p className="text-sm text-muted-foreground mb-3">
        使用专用编辑器配置工位布局
      </p>
      <Button asChild size="sm" className="h-8 text-xs gap-1.5">
        <a href="/dashboard/admin/floor-layout">打开工位布局编辑器</a>
      </Button>
    </div>
  </div>
</TabsContent>
```

同时在文件顶部导入中添加 `MapPin`（从 lucide-react），以及 `Button`（确认已导入）。

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/admin/page.tsx
git commit -m "feat(admin): add floor layout tab in admin panel"
```

---

## Task 9: 构建验证与修复

- [ ] **Step 1: 运行构建，修复所有 TypeScript 错误**

```bash
cd /home/z/codebase/idrl-portal && pnpm build 2>&1 | head -80
```

根据构建输出修复任何类型错误或导入问题。常见问题：
- `PersonnelStats` 导入路径变更
- 旧 `Workstation` 类型在 dashboard 主页中的引用
- `FloorPlan` 缺少 `floor` 参数

- [ ] **Step 2: 启动开发服务器并手动验证**

```bash
pnpm dev
```

验证以下功能：
1. `/dashboard/personnel` — 楼层标签切换正常，SVG 区域正确渲染
2. 点击工位 — 右侧面板显示人员信息
3. 滚动和缩放 — 工位多时正常滚动
4. `/dashboard/admin/floor-layout` — 管理员可见，编辑器表单和预览正常

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "fix: resolve build errors and verify floor layout feature"
```
