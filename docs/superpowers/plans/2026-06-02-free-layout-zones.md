# 自由布局区域 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `floor-layout` 管理页与 `FloorPlan` 渲染层加入"自由模式"区域，使工位可稀疏摆放（不强制 rows×cols 铺满）。

**Architecture:** `Zone` 增加 `mode: 'grid' | 'free'` 与 `maxRows/maxCols`。`grid` 模式行为不变；`free` 模式下区域按 `maxRows/maxCols` 决定尺寸，工位用整数 `row/col` 稀疏存放。新增 `ZoneFreeCanvas` 组件实现"拖拽刷法"画笔交互（add/remove + 单击选中改名），嵌入 `FloorEditor` 工位设置块下方。

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript（strict）· Tailwind v4 · shadcn/ui · lucide-react · pnpm。**无测试框架**——验收依赖类型检查、lint、浏览器手工核对。

**Spec:** `docs/superpowers/specs/2026-06-02-free-layout-zones-design.md`

---

## File Structure

| 路径 | 状态 | 职责 |
|---|---|---|
| `lib/floor-constants.ts` | 新建 | 共享常量（CELL_W、CELL_H、ZONE_PAD、statusColors、statusLabels 等） |
| `lib/types.ts` | 修改 | `Zone` 加 `mode/maxRows/maxCols`；`NewWorkstation` 加 `nameCustomized?` |
| `lib/mock-data.ts` | 修改 | 现有 zone 补默认值；新增 `zone-10c` 自由模式示例 |
| `components/dashboard/floor-plan.tsx` | 修改 | `layoutZones` 按 `mode` 分支；自由模式显示栅格底纹 |
| `components/admin/zone-free-canvas.tsx` | 新建 | 自由模式拖拽刷画布（SVG）+ 工具栏 + 改名输入 |
| `components/admin/floor-editor.tsx` | 修改 | 工位设置块按 `mode` 分支；模式切换按钮；嵌入画布；最小尺寸保护 |

---

## Task 1: 抽出共享常量

**Files:**
- Create: `lib/floor-constants.ts`
- Modify: `components/dashboard/floor-plan.tsx`

- [ ] **Step 1: 创建 `lib/floor-constants.ts`**

```ts
export const CELL_W = 70
export const CELL_H = 50
export const CELL_GAP = 6
export const ZONE_PAD = 16
export const ZONE_TITLE_H = 24
export const ZONE_GAP_X = 20
export const ZONE_GAP_Y = 20
export const ZONES_PER_ROW = 3

export const statusColors: Record<string, string> = {
  online: 'fill-[oklch(0.7_0.2_145)]',
  offline: 'fill-[oklch(0.4_0.02_260)]',
  busy: 'fill-[oklch(0.65_0.2_45)]',
  leave: 'fill-[oklch(0.5_0.15_300)]',
}

export const statusLabels: Record<string, string> = {
  online: '在位',
  offline: '离开',
  busy: '忙碌',
  leave: '请假',
}
```

- [ ] **Step 2: `floor-plan.tsx` 改 import，移除本地常量**

打开 `components/dashboard/floor-plan.tsx`，把第 18–39 行（`CELL_W` 到 `statusLabels` 整段）替换为：

```ts
import {
  CELL_W,
  CELL_H,
  CELL_GAP,
  ZONE_PAD,
  ZONE_TITLE_H,
  ZONE_GAP_X,
  ZONE_GAP_Y,
  ZONES_PER_ROW,
  statusColors,
  statusLabels,
} from '@/lib/floor-constants'
```

（与现有 `import { useState, useMemo, useCallback } from 'react'` 等并列，置于文件顶部 import 区。）

- [ ] **Step 3: 类型 + lint 校验**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 4: 浏览器验证渲染无变化**

Run: `pnpm dev`

打开 `http://localhost:3000/dashboard`（如未登录用任意账号登录），检查 FloorPlan 显示与之前完全一致（9 层 / 10 层、A/B/C/D/E 区域、工位状态点）。

- [ ] **Step 5: Commit**

```bash
git add lib/floor-constants.ts components/dashboard/floor-plan.tsx
git commit -m "refactor: extract floor-plan constants to shared module

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: 扩展类型定义

**Files:**
- Modify: `lib/types.ts:30-61`

- [ ] **Step 1: 修改 `lib/types.ts`**

定位到 `// ============ Floor Layout ============` 段（约 31–61 行），改为：

```ts
// ============ Floor Layout ============
export interface Floor {
  id: string
  name: string
  order: number
  zones: Zone[]
}

export type ZoneMode = 'grid' | 'free'

export interface Zone {
  id: string
  name: string
  floorId: string
  color: string
  order: number
  mode: ZoneMode
  rows: number      // grid 模式：行数；free 模式：闲置（保留 0）
  cols: number      // grid 模式：列数；free 模式：闲置（保留 0）
  maxRows: number   // free 模式：栅格行上限；grid 模式：闲置（默认等于 rows）
  maxCols: number   // free 模式：栅格列上限；grid 模式：闲置（默认等于 cols）
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
  nameCustomized?: boolean
}
```

- [ ] **Step 2: 类型校验**

Run: `pnpm build`
Expected: 编译成功（next.config 已忽略 TS 错误，但仍需观察警告；这里只是新增可选字段与默认值，不应引发错误）

- [ ] **Step 3: 浏览器烟雾测试**

Run: `pnpm dev`

打开 dashboard 页面。**预期：现有渲染未变（因为 mock-data 还未补默认值，但 TypeScript 不会因缺少字段报运行时错误；如果出现渲染异常，立即回到 Task 3 修复 mock 数据后再继续）。**

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add ZoneMode and free-layout fields to Zone/Workstation

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: 迁移 mock-data + 新增自由模式示例

**Files:**
- Modify: `lib/mock-data.ts:423-513`

- [ ] **Step 1: 给现有 zone 补默认值并新增示例**

定位到 `export const mockFloors: FloorType[] = [`（约 448 行），整段替换为：

```ts
export const mockFloors: FloorType[] = [
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
        mode: 'grid',
        rows: 2,
        cols: 3,
        maxRows: 2,
        maxCols: 3,
        workstations: generateWorkstations('zone-9a', 'floor-9', 'A', 2, 3, ['1', '2']),
      },
      {
        id: 'zone-9b',
        name: '博士生区',
        floorId: 'floor-9',
        color: 'oklch(0.65 0.18 145)',
        order: 1,
        mode: 'grid',
        rows: 3,
        cols: 6,
        maxRows: 3,
        maxCols: 6,
        workstations: generateWorkstations('zone-9b', 'floor-9', 'B', 3, 6, ['3', '4']),
      },
      {
        id: 'zone-9c',
        name: '硕士生区',
        floorId: 'floor-9',
        color: 'oklch(0.70 0.15 55)',
        order: 2,
        mode: 'grid',
        rows: 3,
        cols: 6,
        maxRows: 3,
        maxCols: 6,
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
        mode: 'grid',
        rows: 2,
        cols: 4,
        maxRows: 2,
        maxCols: 4,
        workstations: generateWorkstations('zone-10a', 'floor-10', 'D', 2, 4, ['7', '8']),
      },
      {
        id: 'zone-10b',
        name: '会议/讨论区',
        floorId: 'floor-10',
        color: 'oklch(0.60 0.12 30)',
        order: 1,
        mode: 'grid',
        rows: 2,
        cols: 3,
        maxRows: 2,
        maxCols: 3,
        workstations: generateWorkstations('zone-10b', 'floor-10', 'E', 2, 3),
      },
      {
        id: 'zone-10c',
        name: '自由讨论区',
        floorId: 'floor-10',
        color: 'oklch(0.62 0.13 200)',
        order: 2,
        mode: 'free',
        rows: 0,
        cols: 0,
        maxRows: 4,
        maxCols: 6,
        workstations: [
          { id: 'ws-zone-10c-1', name: 'M-01', zoneId: 'zone-10c', floorId: 'floor-10',
            row: 0, col: 1, status: 'empty' },
          { id: 'ws-zone-10c-2', name: 'M-02', zoneId: 'zone-10c', floorId: 'floor-10',
            row: 0, col: 4, status: 'empty' },
          { id: 'ws-zone-10c-3', name: 'M-03', zoneId: 'zone-10c', floorId: 'floor-10',
            row: 2, col: 0, status: 'empty' },
          { id: 'ws-zone-10c-4', name: 'M-04', zoneId: 'zone-10c', floorId: 'floor-10',
            row: 2, col: 5, status: 'empty' },
        ],
      },
    ],
  },
]
```

- [ ] **Step 2: 类型 + lint 校验**

Run: `pnpm build`
Expected: 编译成功

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add lib/mock-data.ts
git commit -m "feat(mock): migrate zones to typed shape, add free-mode example

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: FloorPlan 渲染层支持自由模式

**Files:**
- Modify: `components/dashboard/floor-plan.tsx`

- [ ] **Step 1: 修改 `layoutZones` 按 mode 分支**

定位到 `function layoutZones(floor: Floor)`（约 57 行），把 zoneW/zoneH 计算与 wsPositions 计算替换为：

```ts
function layoutZones(floor: Floor): { zones: ZoneLayout[]; svgW: number; svgH: number } {
  const sorted = [...floor.zones].sort((a, b) => a.order - b.order)
  const zones: ZoneLayout[] = []

  let curX = ZONE_GAP_X
  let curY = ZONE_GAP_Y
  let rowMaxH = 0

  for (const zone of sorted) {
    const gridCols = zone.mode === 'free' ? zone.maxCols : zone.cols
    const gridRows = zone.mode === 'free' ? zone.maxRows : zone.rows

    const zoneW = ZONE_PAD * 2 + gridCols * (CELL_W + CELL_GAP) - CELL_GAP
    const zoneH = ZONE_TITLE_H + ZONE_PAD + gridRows * (CELL_H + CELL_GAP) - CELL_GAP + ZONE_PAD

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
      mode: zone.mode,
      wsPositions,
    })

    curX += zoneW + ZONE_GAP_X
    rowMaxH = Math.max(rowMaxH, zoneH)
  }

  const svgW = Math.max(400, ...zones.map(z => z.x + z.width + ZONE_GAP_X))
  const svgH = Math.max(300, ...zones.map(z => z.y + z.height + ZONE_GAP_Y))

  return { zones, svgW, svgH }
}
```

- [ ] **Step 2: 在 `ZoneLayout` 接口加 `mode` 字段**

定位到 `interface ZoneLayout`（约 41 行），改为：

```ts
interface ZoneLayout {
  id: string
  name: string
  color: string
  x: number
  y: number
  width: number
  height: number
  mode: 'grid' | 'free'
  wsPositions: Array<{
    ws: NewWorkstation
    person?: Person
    x: number
    y: number
  }>
}
```

- [ ] **Step 3: 自由模式渲染栅格底纹**

定位到 `{zones.map(zone => (` 内的 `<g key={zone.id}>` 块（约 147 行）。在 zone 的 `<g>` 内，紧挨着外框 `<rect>` 之后、区域名 `<text>` 之前插入：

```tsx
{zone.mode === 'free' && (() => {
  const z = floor.zones.find(zz => zz.id === zone.id)!
  const cells = []
  for (let r = 0; r < z.maxRows; r++) {
    for (let c = 0; c < z.maxCols; c++) {
      cells.push(
        <rect
          key={`g-${zone.id}-${r}-${c}`}
          x={zone.x + ZONE_PAD + c * (CELL_W + CELL_GAP)}
          y={zone.y + ZONE_TITLE_H + ZONE_PAD + r * (CELL_H + CELL_GAP)}
          width={CELL_W}
          height={CELL_H}
          rx="6"
          fill="none"
          className="stroke-muted-foreground/15"
          strokeWidth="1"
          strokeDasharray="3 3"
        />,
      )
    }
  }
  return <g>{cells}</g>
})()}
```

**说明**：每个 cell 渲染一个虚线透明矩形，仅自由模式显示。Cell 坐标计算与工位定位完全一致（都用 `ZONE_PAD + col*(CELL_W+CELL_GAP)`）。

- [ ] **Step 4: 类型 + lint 校验**

Run: `pnpm build && pnpm lint`
Expected: 成功

- [ ] **Step 5: 浏览器验证**

Run: `pnpm dev`

打开 `/dashboard`，确认：
- 9 层和 10 层的所有网格区域渲染如前
- 10 层新增"自由讨论区"显示，4 个工位（M-01/M-02/M-03/M-04）稀疏分布
- 该自由模式区域外框内可见淡栅格底纹（3×2 个虚线格子的剩余位置）
- 网格区域（如 A/B/C/D/E）**没有**栅格底纹

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/floor-plan.tsx
git commit -m "feat(floor-plan): render free-mode zones with sparse layout and grid underlay

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: ZoneFreeCanvas 组件 - 静态渲染

**Files:**
- Create: `components/admin/zone-free-canvas.tsx`

- [ ] **Step 1: 创建组件骨架**

新建 `components/admin/zone-free-canvas.tsx`：

```tsx
'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import type { Zone, NewWorkstation } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Plus, Eraser } from 'lucide-react'
import {
  CELL_W,
  CELL_H,
  CELL_GAP,
  ZONE_PAD,
  ZONE_TITLE_H,
  statusColors,
} from '@/lib/floor-constants'

type BrushMode = 'add' | 'remove'

interface ZoneFreeCanvasProps {
  zone: Zone
  onChange: (zone: Zone) => void
}

function nextSeq(workstations: NewWorkstation[]): number {
  if (workstations.length === 0) return 1
  // 从工位 id（格式 `ws-${zoneId}-${n}`）中提取最大序号 + 1
  let maxSeq = 0
  for (const ws of workstations) {
    const m = ws.id.match(/-(\d+)$/)
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10))
  }
  return maxSeq + 1
}

function genWsId(zoneId: string, seq: number) {
  // 同时作为 id 后缀与默认 name 后缀，保证 zone 内单调递增、删除不重排
  return `ws-${zoneId}-${seq}`
}

function defaultWsName(zone: Zone, seq: number) {
  const prefix = zone.name.charAt(0) || 'Z'
  return `${prefix}-${String(seq).padStart(2, '0')}`
}

export function ZoneFreeCanvas({ zone, onChange }: ZoneFreeCanvasProps) {
  const [brush, setBrush] = useState<BrushMode>('add')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const layout = useMemo(() => {
    const width = ZONE_PAD * 2 + zone.maxCols * (CELL_W + CELL_GAP) - CELL_GAP
    const height = ZONE_TITLE_H + ZONE_PAD + zone.maxRows * (CELL_H + CELL_GAP) - CELL_GAP + ZONE_PAD
    return { width, height }
  }, [zone.maxRows, zone.maxCols])

  const selectedWs = useMemo(
    () => zone.workstations.find(ws => ws.id === selectedId) ?? null,
    [zone.workstations, selectedId],
  )

  return (
    <div className="space-y-3">
      <CanvasToolbar brush={brush} onBrushChange={setBrush} />
      <CanvasSurface
        zone={zone}
        layout={layout}
        brush={brush}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onChange={onChange}
      />
      <RenameRow
        ws={selectedWs}
        zone={zone}
        onChange={onChange}
      />
    </div>
  )
}

function CanvasToolbar({
  brush,
  onBrushChange,
}: {
  brush: BrushMode
  onBrushChange: (b: BrushMode) => void
}) {
  return (
    <ToggleGroup
      type="single"
      value={brush}
      onValueChange={v => v && onBrushChange(v as BrushMode)}
      className="justify-start"
    >
      <ToggleGroupItem value="add" aria-label="添加工位" className="gap-1.5 text-xs">
        <Plus className="h-3.5 w-3.5" />添加
      </ToggleGroupItem>
      <ToggleGroupItem value="remove" aria-label="清除工位" className="gap-1.5 text-xs">
        <Eraser className="h-3.5 w-3.5" />清除
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function CanvasSurface({
  zone,
  layout,
  brush,
  selectedId,
  onSelect,
  onChange,
}: {
  zone: Zone
  layout: { width: number; height: number }
  brush: BrushMode
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (zone: Zone) => void
}) {
  // 占位实现，下个 Task 替换为带交互的版本
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      className="select-none border border-border rounded-md"
    >
      <rect
        x={0}
        y={0}
        width={layout.width}
        height={layout.height}
        fill="none"
      />
      {/* 栅格底纹 */}
      <g>
        {Array.from({ length: zone.maxRows * zone.maxCols }).map((_, i) => {
          const r = Math.floor(i / zone.maxCols)
          const c = i % zone.maxCols
          return (
            <rect
              key={`g-${r}-${c}`}
              x={ZONE_PAD + c * (CELL_W + CELL_GAP)}
              y={ZONE_TITLE_H + ZONE_PAD + r * (CELL_H + CELL_GAP)}
              width={CELL_W}
              height={CELL_H}
              rx="6"
              fill="none"
              className="stroke-muted-foreground/15"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )
        })}
      </g>
      {/* 工位 */}
      {zone.workstations.map(ws => {
        const x = ZONE_PAD + ws.col * (CELL_W + CELL_GAP)
        const y = ZONE_TITLE_H + ZONE_PAD + ws.row * (CELL_H + CELL_GAP)
        const isSelected = ws.id === selectedId
        return (
          <g key={ws.id}>
            <rect
              x={x}
              y={y}
              width={CELL_W}
              height={CELL_H}
              rx="6"
              className={cn(
                'fill-card',
                isSelected ? 'stroke-primary stroke-2' : 'stroke-muted-foreground/30',
              )}
            />
            <text
              x={x + CELL_W / 2}
              y={y + 24}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-medium pointer-events-none"
            >
              {ws.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function RenameRow({
  ws,
  zone,
  onChange,
}: {
  ws: NewWorkstation | null
  zone: Zone
  onChange: (zone: Zone) => void
}) {
  // 占位实现，下个 Task 替换
  return (
    <div className="text-xs text-muted-foreground">
      {ws ? `已选中：${ws.name}` : '提示：点击工位可选中改名；拖拽可批量添加/清除'}
    </div>
  )
}
```

- [ ] **Step 2: 类型 + lint 校验**

Run: `pnpm build && pnpm lint`
Expected: 成功（组件未被使用，但不应有编译错误）

- [ ] **Step 3: Commit**

```bash
git add components/admin/zone-free-canvas.tsx
git commit -m "feat(admin): scaffold ZoneFreeCanvas with static SVG rendering

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: ZoneFreeCanvas 单击交互（选中、改名、单击添加/清除）

**Files:**
- Modify: `components/admin/zone-free-canvas.tsx`

- [ ] **Step 1: 在 `CanvasSurface` 添加单击逻辑**

定位到 `function CanvasSurface(...)`，把组件内的 `<svg ...>` 内容替换为：

```tsx
function CanvasSurface({
  zone,
  layout,
  brush,
  selectedId,
  onSelect,
  onChange,
}: {
  zone: Zone
  layout: { width: number; height: number }
  brush: BrushMode
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (zone: Zone) => void
}) {
  const findWsByCell = useCallback(
    (r: number, c: number) => zone.workstations.find(ws => ws.row === r && ws.col === c),
    [zone.workstations],
  )

  const handleCellClick = (r: number, c: number) => {
    const existing = findWsByCell(r, c)
    if (existing) {
      onSelect(existing.id)
      return
    }
    // 空 cell
    if (brush === 'add') {
      const seq = nextSeq(zone.workstations)
      const newWs: NewWorkstation = {
        id: genWsId(zone.id, seq),
        name: defaultWsName(zone, seq),
        zoneId: zone.id,
        floorId: zone.floorId,
        row: r,
        col: c,
        status: 'empty',
        nameCustomized: false,
      }
      onChange({ ...zone, workstations: [...zone.workstations, newWs] })
    }
    // remove 模式下点击空 cell 不做任何事
  }

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      className="select-none border border-border rounded-md"
    >
      {/* 栅格底纹 */}
      <g>
        {Array.from({ length: zone.maxRows * zone.maxCols }).map((_, i) => {
          const r = Math.floor(i / zone.maxCols)
          const c = i % zone.maxCols
          return (
            <rect
              key={`g-${r}-${c}`}
              x={ZONE_PAD + c * (CELL_W + CELL_GAP)}
              y={ZONE_TITLE_H + ZONE_PAD + r * (CELL_H + CELL_GAP)}
              width={CELL_W}
              height={CELL_H}
              rx="6"
              fill="none"
              className="stroke-muted-foreground/15"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )
        })}
      </g>

      {/* 透明点击区（覆盖在每个 cell） */}
      <g>
        {Array.from({ length: zone.maxRows * zone.maxCols }).map((_, i) => {
          const r = Math.floor(i / zone.maxCols)
          const c = i % zone.maxCols
          return (
            <rect
              key={`hit-${r}-${c}`}
              x={ZONE_PAD + c * (CELL_W + CELL_GAP)}
              y={ZONE_TITLE_H + ZONE_PAD + r * (CELL_H + CELL_GAP)}
              width={CELL_W}
              height={CELL_H}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => handleCellClick(r, c)}
            />
          )
        })}
      </g>

      {/* 工位 */}
      {zone.workstations.map(ws => {
        const x = ZONE_PAD + ws.col * (CELL_W + CELL_GAP)
        const y = ZONE_TITLE_H + ZONE_PAD + ws.row * (CELL_H + CELL_GAP)
        const isSelected = ws.id === selectedId
        return (
          <g key={ws.id} className="pointer-events-none">
            <rect
              x={x}
              y={y}
              width={CELL_W}
              height={CELL_H}
              rx="6"
              className={cn(
                'fill-card',
                isSelected ? 'stroke-primary stroke-2' : 'stroke-muted-foreground/30',
              )}
            />
            <text
              x={x + CELL_W / 2}
              y={y + 24}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-medium pointer-events-none"
            >
              {ws.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 2: 实现 `RenameRow` 改名逻辑**

把 `RenameRow` 函数替换为：

```tsx
function RenameRow({
  ws,
  zone,
  onChange,
}: {
  ws: NewWorkstation | null
  zone: Zone
  onChange: (zone: Zone) => void
}) {
  if (!ws) {
    return (
      <div className="text-xs text-muted-foreground">
        提示：点击工位可选中改名；拖拽可批量添加/清除
      </div>
    )
  }

  const handleRename = (newName: string) => {
    if (newName.trim() === '') {
      // 清空 → 回退默认命名
      const seq = zone.workstations.indexOf(ws) + 1
      const fallback = defaultWsName(zone, seq)
      onChange({
        ...zone,
        workstations: zone.workstations.map(w =>
          w.id === ws.id ? { ...w, name: fallback, nameCustomized: false } : w,
        ),
      })
      return
    }
    onChange({
      ...zone,
      workstations: zone.workstations.map(w =>
        w.id === ws.id ? { ...w, name: newName.trim(), nameCustomized: true } : w,
      ),
    })
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground shrink-0">改名：</span>
      <Input
        key={ws.id}
        defaultValue={ws.name}
        onBlur={e => handleRename(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="h-8 text-sm flex-1 max-w-[200px]"
        placeholder="清空则恢复默认命名"
      />
      {ws.nameCustomized && (
        <span className="text-[10px] text-muted-foreground/70">自定义</span>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 类型 + lint 校验**

Run: `pnpm build && pnpm lint`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
git add components/admin/zone-free-canvas.tsx
git commit -m "feat(admin): click-to-select and rename in ZoneFreeCanvas

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: ZoneFreeCanvas 拖拽刷法

**Files:**
- Modify: `components/admin/zone-free-canvas.tsx`

- [ ] **Step 1: 在 `CanvasSurface` 加入拖拽状态**

把 `CanvasSurface` 函数体改为以下实现（注意：保留 Task 6 的所有功能，新增拖拽）：

```tsx
function CanvasSurface({
  zone,
  layout,
  brush,
  selectedId,
  onSelect,
  onChange,
}: {
  zone: Zone
  layout: { width: number; height: number }
  brush: BrushMode
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (zone: Zone) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragStart, setDragStart] = useState<{ r: number; c: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ r: number; c: number } | null>(null)
  const [hasDragged, setHasDragged] = useState(false)
  const startPosRef = useRef<{ x: number; y: number } | null>(null)

  const DRAG_THRESHOLD = 4

  const findWsByCell = useCallback(
    (r: number, c: number) => zone.workstations.find(ws => ws.row === r && ws.col === c),
    [zone.workstations],
  )

  const pointToCell = (clientX: number, clientY: number): { r: number; c: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = pt.matrixTransform(ctm.inverse())
    const x = local.x - ZONE_PAD
    const y = local.y - ZONE_TITLE_H - ZONE_PAD
    if (x < 0 || y < 0) return null
    const cellW = CELL_W + CELL_GAP
    const cellH = CELL_H + CELL_GAP
    const c = Math.floor(x / cellW)
    const r = Math.floor(y / cellH)
    if (r < 0 || r >= zone.maxRows || c < 0 || c >= zone.maxCols) return null
    return { r, c }
  }

  const commitDrag = () => {
    if (!dragStart || !dragEnd) return
    const rMin = Math.min(dragStart.r, dragEnd.r)
    const rMax = Math.max(dragStart.r, dragEnd.r)
    const cMin = Math.min(dragStart.c, dragEnd.c)
    const cMax = Math.max(dragStart.c, dragEnd.c)

    let nextWsWithoutDeleted = zone.workstations.filter(w => {
      const inRange = w.row >= rMin && w.row <= rMax && w.col >= cMin && w.col <= cMax
      return !(inRange) // 保留范围外的
    })
    // 范围内被删除的工位（用于 remove 模式反馈，但本任务无需特殊处理）

    if (brush === 'remove') {
      // 直接保留范围外工位
      onChange({ ...zone, workstations: nextWsWithoutDeleted })
    } else {
      // add 模式：在范围内空格添加工位
      const existingKeys = new Set(
        zone.workstations.map(w => `${w.row}-${w.col}`),
      )
      const toAdd: NewWorkstation[] = []
      let seq = nextSeq(zone.workstations)
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          if (existingKeys.has(`${r}-${c}`)) continue
          toAdd.push({
            id: genWsId(zone.id, seq),
            name: defaultWsName(zone, seq),
            zoneId: zone.id,
            floorId: zone.floorId,
            row: r,
            col: c,
            status: 'empty',
            nameCustomized: false,
          })
          seq++
        }
      }
      onChange({ ...zone, workstations: [...zone.workstations, ...toAdd] })
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    const cell = pointToCell(e.clientX, e.clientY)
    if (!cell) return
    startPosRef.current = { x: e.clientX, y: e.clientY }
    setDragStart(cell)
    setDragEnd(cell)
    setHasDragged(false)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart || !startPosRef.current) return
    if (!hasDragged) {
      const dx = e.clientX - startPosRef.current.x
      const dy = e.clientY - startPosRef.current.y
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
      setHasDragged(true)
    }
    const cell = pointToCell(e.clientX, e.clientY)
    if (cell) setDragEnd(cell)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    if (!dragStart) return

    if (!hasDragged) {
      // 单击
      handleCellClick(dragStart.r, dragStart.c)
    } else {
      // 拖拽
      commitDrag()
    }
    setDragStart(null)
    setDragEnd(null)
    setHasDragged(false)
    startPosRef.current = null
  }

  const handleCellClick = (r: number, c: number) => {
    const existing = findWsByCell(r, c)
    if (existing) {
      onSelect(existing.id)
      return
    }
    if (brush === 'add') {
      const seq = nextSeq(zone.workstations)
      const newWs: NewWorkstation = {
        id: genWsId(zone.id),
        name: defaultWsName(zone, seq),
        zoneId: zone.id,
        floorId: zone.floorId,
        row: r,
        col: c,
        status: 'empty',
        nameCustomized: false,
      }
      onChange({ ...zone, workstations: [...zone.workstations, newWs] })
    }
  }

  // 拖拽选区高亮 cells
  const dragCells = useMemo(() => {
    if (!dragStart || !dragEnd || !hasDragged) return null
    const rMin = Math.min(dragStart.r, dragEnd.r)
    const rMax = Math.max(dragStart.r, dragEnd.r)
    const cMin = Math.min(dragStart.c, dragEnd.c)
    const cMax = Math.max(dragStart.c, dragEnd.c)
    const cells: Array<{ r: number; c: number }> = []
    for (let r = rMin; r <= rMax; r++) {
      for (let c = cMin; c <= cMax; c++) cells.push({ r, c })
    }
    return cells
  }, [dragStart, dragEnd, hasDragged])

  const dragCellKeys = useMemo(
    () => new Set((dragCells ?? []).map(c => `${c.r}-${c.c}`)),
    [dragCells],
  )

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      className="select-none border border-border rounded-md touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* 栅格底纹 */}
      <g>
        {Array.from({ length: zone.maxRows * zone.maxCols }).map((_, i) => {
          const r = Math.floor(i / zone.maxCols)
          const c = i % zone.maxCols
          return (
            <rect
              key={`g-${r}-${c}`}
              x={ZONE_PAD + c * (CELL_W + CELL_GAP)}
              y={ZONE_TITLE_H + ZONE_PAD + r * (CELL_H + CELL_GAP)}
              width={CELL_W}
              height={CELL_H}
              rx="6"
              fill="none"
              className="stroke-muted-foreground/15"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )
        })}
      </g>

      {/* 拖拽选区高亮 */}
      {dragCells && (
        <g className="pointer-events-none">
          {dragCells.map(({ r, c }) => (
            <rect
              key={`sel-${r}-${c}`}
              x={ZONE_PAD + c * (CELL_W + CELL_GAP)}
              y={ZONE_TITLE_H + ZONE_PAD + r * (CELL_H + CELL_GAP)}
              width={CELL_W}
              height={CELL_H}
              rx="6"
              fill={brush === 'add' ? 'oklch(0.85 0.1 145)' : 'oklch(0.85 0.1 30)'}
              opacity="0.4"
            />
          ))}
        </g>
      )}

      {/* 工位 */}
      {zone.workstations.map(ws => {
        const x = ZONE_PAD + ws.col * (CELL_W + CELL_GAP)
        const y = ZONE_TITLE_H + ZONE_PAD + ws.row * (CELL_H + CELL_GAP)
        const isSelected = ws.id === selectedId
        const inDrag = dragCellKeys.has(`${ws.row}-${ws.col}`)
        return (
          <g key={ws.id} className="pointer-events-none">
            <rect
              x={x}
              y={y}
              width={CELL_W}
              height={CELL_H}
              rx="6"
              className={cn(
                'fill-card',
                isSelected ? 'stroke-primary stroke-2' : 'stroke-muted-foreground/30',
                inDrag && brush === 'remove' && 'fill-destructive/30',
              )}
            />
            <text
              x={x + CELL_W / 2}
              y={y + 24}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-medium pointer-events-none"
            >
              {ws.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 2: 类型 + lint 校验**

Run: `pnpm build && pnpm lint`
Expected: 成功

- [ ] **Step 3: Commit**

```bash
git add components/admin/zone-free-canvas.tsx
git commit -m "feat(admin): drag-brush selection in ZoneFreeCanvas

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: FloorEditor 模式分支 UI + 嵌入画布

**Files:**
- Modify: `components/admin/floor-editor.tsx`

- [ ] **Step 1: 加 import**

在文件顶部 import 区追加：

```ts
import { ZoneFreeCanvas } from './zone-free-canvas'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Lock } from 'lucide-react'
```

- [ ] **Step 2: 改造"工位设置"块按 mode 分支**

定位到 `{selectedZone && (` 起始的 `<section>`（约 226 行），把整个 section（直到 `)}` 闭合）替换为：

```tsx
{selectedZone && (
  <section>
    <h3 className="text-sm font-medium mb-2">工位设置 · {selectedZone.name}</h3>

    <div className="grid grid-cols-2 gap-3 mb-3">
      <div className="space-y-1.5">
        <Label className="text-xs">
          {selectedZone.mode === 'free' ? '最大行数' : '行数'}
        </Label>
        <Input
          type="number"
          min={1}
          max={50}
          value={selectedZone.mode === 'free' ? selectedZone.maxRows : selectedZone.rows}
          onChange={e => {
            const v = Number(e.target.value) || 1
            if (selectedZone.mode === 'free') {
              updateMaxSize(selectedZone.id, 'maxRows', v)
            } else {
              updateZoneGrid(v, selectedZone.cols)
            }
          }}
          onBlur={e => {
            if (selectedZone.mode === 'free') {
              validateMaxSize(selectedZone.id, 'maxRows', Number(e.target.value) || 1)
            }
          }}
          className="h-8 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">
          {selectedZone.mode === 'free' ? '最大列数' : '列数'}
        </Label>
        <Input
          type="number"
          min={1}
          max={50}
          value={selectedZone.mode === 'free' ? selectedZone.maxCols : selectedZone.cols}
          onChange={e => {
            const v = Number(e.target.value) || 1
            if (selectedZone.mode === 'free') {
              updateMaxSize(selectedZone.id, 'maxCols', v)
            } else {
              updateZoneGrid(selectedZone.rows, v)
            }
          }}
          onBlur={e => {
            if (selectedZone.mode === 'free') {
              validateMaxSize(selectedZone.id, 'maxCols', Number(e.target.value) || 1)
            }
          }}
          className="h-8 text-sm"
        />
      </div>
    </div>

    {selectedZone.mode === 'grid' ? (
      <p className="text-xs text-muted-foreground">
        将生成 {selectedZone.rows} × {selectedZone.cols} = {selectedZone.rows * selectedZone.cols} 个工位
      </p>
    ) : (
      <p className="text-xs text-muted-foreground">
        当前 {selectedZone.workstations.length} / {selectedZone.maxRows * selectedZone.maxCols} 个工位
      </p>
    )}
  </section>
)}

{selectedZone && selectedZone.mode === 'free' && (
  <section>
    <h3 className="text-sm font-medium mb-2">自由布局画布 · {selectedZone.name}</h3>
    <ZoneFreeCanvas
      zone={selectedZone}
      onChange={updated => updateZoneFully(selectedZone.id, updated)}
    />
  </section>
)}
```

- [ ] **Step 3: 加辅助函数**

在 `FloorEditor` 组件内部（紧挨 `updateZoneGrid` 函数后）追加：

```ts
const updateMaxSize = (zoneId: string, key: 'maxRows' | 'maxCols', value: number) => {
  if (!selectedFloor) return
  updateFloors(f =>
    f.map(fl => fl.id === selectedFloor.id
      ? {
          ...fl,
          zones: fl.zones.map(z => z.id === zoneId ? { ...z, [key]: value } : z),
        }
      : fl,
    ),
  )
}

const validateMaxSize = (zoneId: string, key: 'maxRows' | 'maxCols', value: number) => {
  if (!selectedFloor) return
  const zone = selectedFloor.zones.find(z => z.id === zoneId)
  if (!zone) return
  const workstations = zone.workstations
  const usedMax = key === 'maxRows'
    ? Math.max(-1, ...workstations.map(w => w.row)) + 1
    : Math.max(-1, ...workstations.map(w => w.col)) + 1
  const safe = Math.max(1, value, usedMax)
  if (safe !== value) {
    // 回退到安全值（toast 在下个任务加，这里直接 alert）
    alert(`无法缩小到 ${value}（现有工位需要至少 ${usedMax}），已自动调整`)
    updateMaxSize(zoneId, key, safe)
  }
}

const updateZoneFully = (zoneId: string, updated: typeof selectedFloor.zones[0]) => {
  if (!selectedFloor) return
  updateFloors(f =>
    f.map(fl => fl.id === selectedFloor.id
      ? {
          ...fl,
          zones: fl.zones.map(z => z.id === zoneId ? updated : z),
        }
      : fl,
    ),
  )
}
```

- [ ] **Step 4: 类型 + lint 校验**

Run: `pnpm build && pnpm lint`
Expected: 成功

- [ ] **Step 5: 浏览器验证**

Run: `pnpm dev`

打开 `/dashboard/admin/floor-layout`：
- 用 `admin/admin` 登录
- 在区域管理里点击"自由讨论区"（floor-10 下）
- 工位设置显示"最大行数 / 最大列数"，值为 4 / 6
- 下方出现"自由布局画布" section，渲染 M-01~M-04
- 点击空白格 → 立即添加一个 M-05 工位
- 点击已有工位 → 选中后下方出现改名输入框
- 改名 → blur 后名字更新；清空再 blur → 回退默认名
- 切换"清除"画笔 → 单击工位选中（不删除）；后续 Task 9 完成后才能拖拽删除

- [ ] **Step 6: Commit**

```bash
git add components/admin/floor-editor.tsx
git commit -m "feat(admin): integrate ZoneFreeCanvas into FloorEditor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: 模式切换按钮（grid → free 单向）

**Files:**
- Modify: `components/admin/floor-editor.tsx`

- [ ] **Step 1: 加 `switchZoneMode` 函数**

在 `FloorEditor` 内部的 `updateZoneFully` 之后追加：

```ts
const switchZoneMode = (zoneId: string, fromMode: 'grid' | 'free', toMode: 'grid' | 'free') => {
  if (!selectedFloor) return
  if (fromMode === 'free' && toMode === 'grid') return // 不允许

  updateFloors(f =>
    f.map(fl => fl.id === selectedFloor.id
      ? {
          ...fl,
          zones: fl.zones.map(z => {
            if (z.id !== zoneId) return z
            if (fromMode === 'grid' && toMode === 'free') {
              return {
                ...z,
                mode: 'free' as const,
                maxRows: z.rows,
                maxCols: z.cols,
                workstations: z.workstations.map(w => ({ ...w, nameCustomized: false })),
              }
            }
            return z
          }),
        }
      : fl,
    ),
  )
}
```

- [ ] **Step 2: 在"工位设置"标题旁加模式切换按钮**

定位到 `<h3 className="text-sm font-medium mb-2">工位设置 · {selectedZone.name}</h3>`，替换为：

```tsx
<div className="flex items-center justify-between mb-2">
  <h3 className="text-sm font-medium">工位设置 · {selectedZone.name}</h3>
  <div className="flex items-center gap-1">
    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
      {selectedZone.mode === 'grid' ? '网格模式' : '自由模式'}
    </span>
    {selectedZone.mode === 'grid' ? (
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-xs"
        onClick={() => switchZoneMode(selectedZone.id, 'grid', 'free')}
      >
        切换为自由模式
      </Button>
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button size="sm" variant="outline" className="h-6 text-xs" disabled>
              <Lock className="h-3 w-3 mr-1" />切换为网格模式
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          自由模式无法转回网格（会丢失稀疏布局）。请删除区域后重建。
        </TooltipContent>
      </Tooltip>
    )}
  </div>
</div>
```

- [ ] **Step 3: 包裹 TooltipProvider**

定位到 `FloorEditor` 的 return 顶部 `<div className="space-y-5">`，在外层包一层：

把：
```tsx
return (
  <div className="space-y-5">
    ...
  </div>
)
```

改为：
```tsx
return (
  <TooltipProvider delayDuration={200}>
    <div className="space-y-5">
      ...
    </div>
  </TooltipProvider>
)
```

并补上 import（如未在文件顶部）：

```ts
import { TooltipProvider } from '@/components/ui/tooltip'
```

- [ ] **Step 4: 类型 + lint 校验**

Run: `pnpm build && pnpm lint`
Expected: 成功

- [ ] **Step 5: 浏览器验证**

- 选中网格区域（如"教授/博士后区"） → 显示"切换为自由模式"按钮
- 点击 → 区域变为自由模式，工位数量与位置保持
- 选中自由区域（"自由讨论区"） → 显示禁用的"切换为网格模式"按钮 + tooltip
- 在自由区域调整"最大行数"为 2 → 失焦时（若现有工位需要的行数大于 2）弹出 alert 并回退

- [ ] **Step 6: Commit**

```bash
git add components/admin/floor-editor.tsx
git commit -m "feat(admin): add grid→free mode switch button with reverse disabled

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 10: 全量验收

**Files:** 无修改

- [ ] **Step 1: 类型 + lint 全量**

Run: `pnpm build`
Expected: 编译成功

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 2: 浏览器手工清单**

Run: `pnpm dev`，登录 `/dashboard/admin/floor-layout`（admin/admin）。

**渲染**：
- [ ] `/dashboard` 的 FloorPlan 显示原有网格区域，外观无变化
- [ ] `/dashboard/admin/floor-layout` 右侧预览显示"自由讨论区"，4 个工位稀疏分布
- [ ] 自由模式区域外框内显示淡栅格底纹（grid 模式不显示）

**编辑器**：
- [ ] 选中网格区域 → 工位设置显示行列输入
- [ ] 选中自由区域 → 工位设置显示 maxRows/maxCols，下方出现画布
- [ ] 默认"添加"画笔，拖拽空白 → 经过的格子变为工位，名字自动 M-05/06...
- [ ] 单击空白格 → 添加单工位
- [ ] 单击已有工位 → 选中（不重复添加），改名输入框出现
- [ ] 改名 → blur 后保存；清空 blur → 回退默认命名；显示"自定义"标记
- [ ] 切换"清除"画笔，拖拽 → 范围内工位被删
- [ ] 删除中间工位（如 M-05）后，M-06/M-07 名字不变
- [ ] `grid → free` 按钮可用，转换后工位 row/col 保留
- [ ] `free → grid` 按钮禁用 + tooltip 解释

**边界**：
- [ ] 拖拽超出 `maxRows/maxCols` 范围不响应
- [ ] 缩小 `maxRows` 至能容纳现有工位的最小尺寸以下 → 失焦 alert + 回退

- [ ] **Step 3: 标记完成**

如全部通过，提交空 commit 作为里程碑：

```bash
git commit --allow-empty -m "chore: free-layout zones acceptance verified

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 总结

| 任务 | 输出 |
|---|---|
| Task 1 | 共享常量抽出，floor-plan.tsx 改 import |
| Task 2 | `ZoneMode` 类型与 `mode/maxRows/maxCols/nameCustomized` 字段 |
| Task 3 | mock-data 全部迁移 + `zone-10c` 自由模式示例 |
| Task 4 | `FloorPlan` 按 mode 分支 + free 模式栅格底纹 |
| Task 5 | `ZoneFreeCanvas` 静态 SVG 骨架 |
| Task 6 | 单击选中、单击添加、改名 |
| Task 7 | 拖拽刷法（add/remove + 矩形选区） |
| Task 8 | `FloorEditor` 嵌入画布 + maxRows/maxCols 输入 + 最小尺寸保护 |
| Task 9 | 模式切换按钮（grid → free 单向）+ tooltip |
| Task 10 | 全量 lint/build + 浏览器手工验收清单 |

每个 Task 一个独立 commit，可单独回滚。
