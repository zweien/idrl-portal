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
      workstations: [] as typeof selectedFloor.zones[0]['workstations'],
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

  const updateZoneGrid = (rows: number, cols: number) => {
    if (!selectedFloor || !selectedZone) return
    updateFloors(f =>
      f.map(fl => fl.id === selectedFloor.id
        ? {
            ...fl,
            zones: fl.zones.map(z => {
              if (z.id !== selectedZone.id) return z
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
