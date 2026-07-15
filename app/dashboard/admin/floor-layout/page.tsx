'use client'

import { useEffect, useMemo, useState } from 'react'
import { isEqual } from 'lodash-es'
import { FloorEditor } from '@/components/admin/floor-editor'
import { FloorPreview } from '@/components/admin/floor-preview'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useFloorLayout, putJSON } from '@/lib/api'
import type { Floor } from '@/lib/types'
import { ShieldAlert, Save } from 'lucide-react'

export default function FloorLayoutPage() {
  const { user } = useAuth()
  const { data, mutate } = useFloorLayout()
  const serverFloors = data?.floors

  const [localFloors, setLocalFloors] = useState<Floor[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedFloorId, setSelectedFloorId] = useState<string>('')

  // 初始加载时把 server 数据复制到 local，并初始化选中楼层
  useEffect(() => {
    if (serverFloors && localFloors === null) {
      setLocalFloors(serverFloors)
      setSelectedFloorId(serverFloors[0]?.id ?? '')
    }
  }, [serverFloors, localFloors])

  const dirty = useMemo(() => {
    if (!serverFloors || !localFloors) return false
    return !isEqual(localFloors, serverFloors)
  }, [serverFloors, localFloors])

  // beforeunload 拦截
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  async function save() {
    if (!localFloors || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await putJSON('/api/floor-layout', { floors: localFloors })
      await mutate()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

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

  if (!localFloors) {
    return (
      <div className="space-y-4 py-2">
        <h1 className="text-xl font-semibold tracking-tight">工位布局管理</h1>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  const previewFloor = localFloors.find(f => f.id === selectedFloorId) ?? null

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">工位布局管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">配置楼层、区域和工位</p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs text-amber-600 font-medium">● 未保存改动</span>
          )}
          {saveError && (
            <span className="text-xs text-destructive">保存失败：{saveError}</span>
          )}
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={save}
            disabled={!dirty || saving}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">配置编辑</p>
            <p className="text-xs text-muted-foreground mt-0.5">添加楼层、区域，设置工位行列数</p>
          </div>
          <div className="p-4">
            <FloorEditor
              floors={localFloors}
              onChange={setLocalFloors}
              selectedFloorId={selectedFloorId}
              onSelectedFloorIdChange={setSelectedFloorId}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">实时预览</p>
            <p className="text-xs text-muted-foreground mt-0.5">配置变更即时反映到平面图</p>
          </div>
          <div className="p-4">
            {previewFloor ? <FloorPreview floor={previewFloor} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
