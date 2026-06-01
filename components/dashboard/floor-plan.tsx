'use client'

import { useState, useMemo } from 'react'
import { mockWorkstations, mockPersonnel, getPersonByWorkstation } from '@/lib/mock-data'
import type { Workstation, Person } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

const statusColors = {
  online: 'fill-[oklch(0.7_0.2_145)]',
  offline: 'fill-[oklch(0.4_0.02_260)]',
  busy: 'fill-[oklch(0.65_0.2_45)]',
  leave: 'fill-[oklch(0.5_0.15_300)]',
}

const statusLabels = {
  online: '在位',
  offline: '离开',
  busy: '忙碌',
  leave: '请假',
}

const zoneColors = {
  A: 'stroke-primary/30',
  B: 'stroke-accent/30',
  C: 'stroke-chart-3/30',
  D: 'stroke-chart-4/30',
}

const zoneLabels = {
  A: '教授/博士后',
  B: '博士生',
  C: '硕士生',
  D: '本科生/行政',
}

interface FloorPlanProps {
  onSelectWorkstation?: (workstation: Workstation, person?: Person) => void
  selectedWorkstationId?: string
}

export function FloorPlan({ onSelectWorkstation, selectedWorkstationId }: FloorPlanProps) {
  const [hoveredWs, setHoveredWs] = useState<string | null>(null)

  const workstationsWithPersons = useMemo(() => {
    return mockWorkstations.map(ws => ({
      ...ws,
      person: ws.personId ? getPersonByWorkstation(ws.id) : undefined,
    }))
  }, [])

  const zones = useMemo(() => {
    const zoneMap = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>()
    
    workstationsWithPersons.forEach(ws => {
      const zone = zoneMap.get(ws.zone) || { minX: Infinity, minY: Infinity, maxX: 0, maxY: 0 }
      zone.minX = Math.min(zone.minX, ws.x - 10)
      zone.minY = Math.min(zone.minY, ws.y - 10)
      zone.maxX = Math.max(zone.maxX, ws.x + ws.width + 10)
      zone.maxY = Math.max(zone.maxY, ws.y + ws.height + 10)
      zoneMap.set(ws.zone, zone)
    })
    
    return Array.from(zoneMap.entries()).map(([zone, bounds]) => ({
      zone: zone as 'A' | 'B' | 'C' | 'D',
      ...bounds,
    }))
  }, [workstationsWithPersons])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative w-full overflow-auto">
        <svg
          viewBox="0 0 480 460"
          className="w-full h-auto min-w-[400px]"
          style={{ maxHeight: '500px' }}
        >
          {/* Background */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-border/30"
              />
            </pattern>
            <linearGradient id="wsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="oklch(0.65 0.2 260 / 0.3)" />
              <stop offset="100%" stopColor="oklch(0.55 0.25 300 / 0.3)" />
            </linearGradient>
          </defs>
          
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Zone backgrounds */}
          {zones.map(({ zone, minX, minY, maxX, maxY }) => (
            <g key={zone}>
              <rect
                x={minX}
                y={minY}
                width={maxX - minX}
                height={maxY - minY}
                rx="8"
                className={cn('fill-none', zoneColors[zone])}
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              <text
                x={minX + 8}
                y={minY + 16}
                className="fill-muted-foreground text-[10px] font-medium"
              >
                {zone} 区 - {zoneLabels[zone]}
              </text>
            </g>
          ))}
          
          {/* Workstations */}
          {workstationsWithPersons.map((ws) => {
            const isSelected = selectedWorkstationId === ws.id
            const isHovered = hoveredWs === ws.id
            const isOccupied = !!ws.person
            
            return (
              <Tooltip key={ws.id}>
                <TooltipTrigger asChild>
                  <g
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setHoveredWs(ws.id)}
                    onMouseLeave={() => setHoveredWs(null)}
                    onClick={() => onSelectWorkstation?.(ws, ws.person)}
                  >
                    {/* Workstation desk */}
                    <rect
                      x={ws.x}
                      y={ws.y}
                      width={ws.width}
                      height={ws.height}
                      rx="6"
                      className={cn(
                        'transition-all duration-200',
                        isOccupied ? 'fill-card' : 'fill-muted/50',
                        isSelected && 'stroke-primary stroke-2',
                        isHovered && !isSelected && 'stroke-primary/50 stroke-1'
                      )}
                    />
                    
                    {/* Status indicator */}
                    {ws.person && (
                      <circle
                        cx={ws.x + ws.width - 10}
                        cy={ws.y + 10}
                        r="5"
                        className={cn(
                          statusColors[ws.person.status],
                          'transition-all duration-200'
                        )}
                      />
                    )}
                    
                    {/* Workstation name */}
                    <text
                      x={ws.x + ws.width / 2}
                      y={ws.y + (isOccupied ? 28 : ws.height / 2 + 4)}
                      textAnchor="middle"
                      className={cn(
                        'text-[11px] font-medium pointer-events-none',
                        isOccupied ? 'fill-foreground' : 'fill-muted-foreground'
                      )}
                    >
                      {ws.name}
                    </text>
                    
                    {/* Person name */}
                    {ws.person && (
                      <text
                        x={ws.x + ws.width / 2}
                        y={ws.y + 45}
                        textAnchor="middle"
                        className="fill-muted-foreground text-[10px] pointer-events-none"
                      >
                        {ws.person.name}
                      </text>
                    )}
                    
                    {/* Hover/Selection glow */}
                    {(isHovered || isSelected) && (
                      <rect
                        x={ws.x - 2}
                        y={ws.y - 2}
                        width={ws.width + 4}
                        height={ws.height + 4}
                        rx="8"
                        fill="none"
                        className="stroke-primary/30"
                        strokeWidth="2"
                      />
                    )}
                  </g>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <div className="space-y-1">
                    <p className="font-medium">{ws.name}</p>
                    {ws.person ? (
                      <>
                        <p className="text-sm">{ws.person.name}</p>
                        <Badge variant="outline" className="text-xs">
                          {statusLabels[ws.person.status]}
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
          
          {/* Legend */}
          <g transform="translate(380, 400)">
            <text x="0" y="0" className="fill-muted-foreground text-[10px] font-medium">
              状态图例
            </text>
            {Object.entries(statusLabels).map(([status, label], i) => (
              <g key={status} transform={`translate(0, ${15 + i * 14})`}>
                <circle
                  cx="6"
                  cy="0"
                  r="4"
                  className={statusColors[status as keyof typeof statusColors]}
                />
                <text x="16" y="3" className="fill-muted-foreground text-[9px]">
                  {label}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </TooltipProvider>
  )
}

// Personnel stats component
export function PersonnelStats() {
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
