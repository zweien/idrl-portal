'use client'

import { useState } from 'react'
import type { Resource, ResourceType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Pencil } from 'lucide-react'

const typeLabels: Record<ResourceType, string> = {
  compute: '计算资源', storage: '存储资源', code: '代码仓库', docs: '文档资料', other: '其他',
}

const statusOptions: { value: Resource['status']; label: string }[] = [
  { value: 'available', label: '可用' },
  { value: 'maintenance', label: '维护中' },
  { value: 'restricted', label: '受限' },
]

const accessOptions: { value: Resource['accessLevel']; label: string }[] = [
  { value: 'public', label: '公开' },
  { value: 'member', label: '成员' },
  { value: 'admin', label: '管理员' },
]

interface ResourceDialogProps {
  initialData?: Resource
  trigger?: React.ReactNode
  onSubmit: (resource: Resource) => void
}

export function ResourceDialog({ initialData, trigger, onSubmit }: ResourceDialogProps) {
  const isEdit = !!initialData
  const [open, setOpen] = useState(!!initialData)
  const [form, setForm] = useState({
    name: initialData?.name ?? '',
    type: initialData?.type ?? ('compute' as ResourceType),
    description: initialData?.description ?? '',
    url: initialData?.url ?? '',
    status: initialData?.status ?? ('available' as Resource['status']),
    accessLevel: initialData?.accessLevel ?? ('member' as Resource['accessLevel']),
  })

  const handleSubmit = () => {
    if (!form.name) return
    onSubmit({
      id: initialData?.id ?? `r-${Date.now()}`,
      name: form.name,
      type: form.type,
      description: form.description,
      url: form.url || undefined,
      status: form.status,
      accessLevel: form.accessLevel,
    })
    setOpen(false)
  }

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (val && initialData) {
      setForm({
        name: initialData.name,
        type: initialData.type,
        description: initialData.description,
        url: initialData.url ?? '',
        status: initialData.status,
        accessLevel: initialData.accessLevel,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="h-8 text-xs gap-1.5">
            {isEdit ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {isEdit ? '编辑' : '添加资源'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑资源' : '添加新资源'}</DialogTitle>
          <DialogDescription>{isEdit ? '修改资源信息' : '填写资源基本信息。'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">名称 *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="资源名称" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">类型</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(typeLabels) as [ResourceType, string][]).map(([v, l]) => (
                <Button key={v} type="button" size="sm" variant={form.type === v ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setForm({ ...form, type: v })}>
                  {l}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">描述</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="资源描述" className="min-h-[80px] text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">状态</Label>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map(({ value, label }) => (
                <Button key={value} type="button" size="sm" variant={form.status === value ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setForm({ ...form, status: value })}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">访问级别</Label>
            <div className="flex flex-wrap gap-1.5">
              {accessOptions.map(({ value, label }) => (
                <Button key={value} type="button" size="sm" variant={form.accessLevel === value ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setForm({ ...form, accessLevel: value })}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!form.name}>{isEdit ? '保存' : '添加'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
