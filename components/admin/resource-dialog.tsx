'use client'

import { useState } from 'react'
import type { Resource, ResourceType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'

const typeLabels: Record<ResourceType, string> = {
  compute: '计算资源', storage: '存储资源', code: '代码仓库', docs: '文档资料', other: '其他',
}

/** Icon names admins can pick from. Read-side maps name → lucide component. */
const iconChoices = ['Cpu', 'Database', 'GitBranch', 'BookOpen', 'Box', 'Server', 'Cloud', 'Globe', 'Terminal', 'FileText'] as const

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
    icon: initialData?.icon ?? '',
  })
  // specs edited as key/value rows (blank rows are dropped on submit)
  const [specRows, setSpecRows] = useState<{ k: string; v: string }[]>(
    initialData?.specs ? Object.entries(initialData.specs).map(([k, v]) => ({ k, v })) : [],
  )

  const setSpecRow = (idx: number, key: 'k' | 'v', value: string) =>
    setSpecRows(rows => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))
  const addSpecRow = () => setSpecRows(rows => [...rows, { k: '', v: '' }])
  const removeSpecRow = (idx: number) => setSpecRows(rows => rows.filter((_, i) => i !== idx))

  const handleSubmit = () => {
    if (!form.name) return
    const specsObj: Record<string, string> = {}
    for (const { k, v } of specRows) {
      const key = k.trim()
      if (key) specsObj[key] = v
    }
    onSubmit({
      id: initialData?.id ?? `r-${Date.now()}`,
      name: form.name,
      type: form.type,
      description: form.description,
      url: form.url || undefined,
      status: form.status,
      accessLevel: form.accessLevel,
      icon: form.icon || undefined,
      specs: Object.keys(specsObj).length > 0 ? specsObj : undefined,
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
        icon: initialData.icon ?? '',
      })
      setSpecRows(initialData.specs ? Object.entries(initialData.specs).map(([k, v]) => ({ k, v })) : [])
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
          <div className="space-y-1.5">
            <Label className="text-xs">图标（覆盖类型默认）</Label>
            <Select
              value={form.icon || '__default__'}
              onValueChange={v => setForm({ ...form, icon: v === '__default__' ? '' : v })}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="使用类型默认图标" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">使用类型默认图标</SelectItem>
                {iconChoices.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">配置规格</Label>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={addSpecRow}>
                <Plus className="h-3 w-3" />添加规格
              </Button>
            </div>
            {specRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无规格，点击"添加规格"新建键值对</p>
            ) : (
              <div className="space-y-1.5">
                {specRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Input
                      value={row.k}
                      onChange={e => setSpecRow(idx, 'k', e.target.value)}
                      placeholder="键（如 CPU）"
                      className="h-8 text-sm flex-1"
                    />
                    <Input
                      value={row.v}
                      onChange={e => setSpecRow(idx, 'v', e.target.value)}
                      placeholder="值（如 64核）"
                      className="h-8 text-sm flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSpecRow(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
