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
              <defs>
                <pattern id="grid-floor" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border/30" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-floor)" />

              {zones.map(zone => (
                <g key={zone.id}>
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
                  <text
                    x={zone.x + ZONE_PAD}
                    y={zone.y + ZONE_TITLE_H - 4}
                    className="fill-muted-foreground text-[12px] font-medium"
                  >
                    {zone.name}
                  </text>

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
                            />

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

                            {person && (
                              <circle
                                cx={x + CELL_W - 10}
                                cy={y + 10}
                                r="5"
                                className={cn(statusColors[person.status])}
                              />
                            )}

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

export { default as PersonnelStats } from './personnel-stats'
