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
