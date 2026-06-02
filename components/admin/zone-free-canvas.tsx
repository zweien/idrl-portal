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
