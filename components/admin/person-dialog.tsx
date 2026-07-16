'use client'

import { useState } from 'react'
import type { Person } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

const roleLabels: Record<Person['role'], string> = {
  professor: '教授', postdoc: '博士后', phd: '博士生',
  master: '硕士生', undergraduate: '本科生', staff: '行政人员',
}

const statusOptions: { value: Person['status']; label: string }[] = [
  { value: 'present', label: '在位' },
  { value: 'leave', label: '请假' },
  { value: 'trip', label: '出差' },
  { value: 'absent', label: '未到' },
]

interface PersonDialogProps {
  initialData?: Person
  trigger?: React.ReactNode
  onSubmit: (person: Person) => void
}

export function PersonDialog({ initialData, trigger, onSubmit }: PersonDialogProps) {
  const isEdit = !!initialData
  const [open, setOpen] = useState(!!initialData)
  const [form, setForm] = useState({
    name: initialData?.name ?? '',
    email: initialData?.email ?? '',
    role: initialData?.role ?? ('master' as Person['role']),
    phone: initialData?.phone ?? '',
    status: initialData?.status ?? ('absent' as Person['status']),
    researchAreas: initialData?.researchAreas?.join(', ') ?? '',
  })

  const handleSubmit = () => {
    if (!form.name) return
    onSubmit({
      id: initialData?.id ?? `p-${Date.now()}`,
      name: form.name,
      email: form.email || undefined,
      role: form.role,
      phone: form.phone || undefined,
      status: form.status,
      researchAreas: form.researchAreas
        ? form.researchAreas.split(/[,，]/).map(s => s.trim()).filter(Boolean)
        : undefined,
    })
    setOpen(false)
  }

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (val && initialData) {
      setForm({
        name: initialData.name,
        email: initialData.email ?? '',
        role: initialData.role,
        phone: initialData.phone ?? '',
        status: initialData.status,
        researchAreas: initialData.researchAreas?.join(', ') ?? '',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="h-8 text-xs gap-1.5">
            {isEdit ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {isEdit ? '编辑' : '添加人员'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑人员' : '添加新人员'}</DialogTitle>
          <DialogDescription>{isEdit ? '修改人员信息' : '填写人员基本信息，添加后可继续编辑。'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">姓名 *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="请输入姓名" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">邮箱</Label>
            <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@idrl.edu.cn" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">电话</Label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="手机号" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">角色</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(roleLabels) as [Person['role'], string][]).map(([v, l]) => (
                <Button key={v} type="button" size="sm" variant={form.role === v ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setForm({ ...form, role: v })}>
                  {l}
                </Button>
              ))}
            </div>
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
            <Label className="text-xs">研究方向（逗号分隔）</Label>
            <Input value={form.researchAreas} onChange={e => setForm({ ...form, researchAreas: e.target.value })} placeholder="深度学习, 计算机视觉" className="h-9" />
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
