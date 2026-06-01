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
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">配置编辑</p>
            <p className="text-xs text-muted-foreground mt-0.5">添加楼层、区域，设置工位行列数</p>
          </div>
          <div className="p-4">
            <FloorEditor floors={floors} onChange={setFloors} />
          </div>
        </div>

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
