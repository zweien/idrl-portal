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

    if (brush === 'remove') {
      const remaining = zone.workstations.filter(w => {
        const inRange = w.row >= rMin && w.row <= rMax && w.col >= cMin && w.col <= cMax
        return !inRange
      })
      onChange({ ...zone, workstations: remaining })
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
      // 清空 → 回退默认命名（从 ws.id 提取 seq，与 nextSeq 保持一致）
      const m = ws.id.match(/-(\d+)$/)
      const seq = m ? parseInt(m[1], 10) : zone.workstations.indexOf(ws) + 1
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
