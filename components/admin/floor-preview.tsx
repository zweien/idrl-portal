'use client'

import type { Floor } from '@/lib/types'
import { FloorPlan } from '@/components/dashboard/floor-plan'
import { usePersonnel } from '@/lib/api'

interface FloorPreviewProps {
  floor: Floor | undefined
}

export function FloorPreview({ floor }: FloorPreviewProps) {
  const { data: personnelResp } = usePersonnel({ pageSize: 1000 })
  const personnel = personnelResp?.data?.items ?? []

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
      <FloorPlan floor={floor} personnel={personnel} readOnly />
    </div>
  )
}
