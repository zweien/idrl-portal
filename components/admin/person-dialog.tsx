'use client'

import { useRef, useState } from 'react'
import type { Person } from '@/lib/types'
import { uploadImage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Pencil, Loader2 } from 'lucide-react'

const statusOptions: { value: Person['status']; label: string }[] = [
  { value: 'present', label: '在位' },
  { value: 'leave', label: '请假' },
  { value: 'trip', label: '出差' },
  { value: 'absent', label: '未到' },
]

interface PersonDialogProps {
  /** Parent unmounts the dialog on close so the next edit remounts with open=true. */
  onCloseRequest?: () => void
  initialData?: Person
  trigger?: React.ReactNode
  onSubmit: (person: Person) => void
}

export function PersonDialog({ initialData, trigger, onSubmit, onCloseRequest }: PersonDialogProps) {
  const isEdit = !!initialData
  const [open, setOpen] = useState(!!initialData)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: initialData?.name ?? '',
    photoUrl: initialData?.photoUrl ?? '',
    email: initialData?.email ?? '',
    role: initialData?.role ?? '',
    department: initialData?.department ?? '',
    phone: initialData?.phone ?? '',
    status: initialData?.status ?? ('absent' as Person['status']),
    researchAreas: initialData?.researchAreas?.join(', ') ?? '',
  })

  const handlePhotoChange = async (file: File | undefined) => {
    if (!file) return
    setPhotoError(null)
    setPhotoUploading(true)
    try {
      const { url } = await uploadImage(file)
      setForm(prev => ({ ...prev, photoUrl: url }))
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setPhotoUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = () => {
    if (!form.name || photoUploading) return
    onSubmit({
      id: initialData?.id ?? `p-${Date.now()}`,
      name: form.name,
      email: form.email || undefined,
      role: form.role,
      // 始终提交字符串（空串也要发）：PATCH 按 {...existing, ...body} 合并，
      // 字段缺席会保留旧值，导致无法清空（codex review 曾两次抓到这类问题：
      // department 与本处的 photoUrl）。
      department: form.department,
      photoUrl: form.photoUrl,
      phone: form.phone || undefined,
      status: form.status,
      researchAreas: form.researchAreas
        ? form.researchAreas.split(/[,，]/).map(s => s.trim()).filter(Boolean)
        : undefined,
    })
    setOpen(false)
    onCloseRequest?.()
  }

  const handleOpenChange = (val: boolean) => {
    // Dismissals via the X button / Escape / backdrop land here (cancel and
    // submit call setOpen directly) — the parent must unmount the dialog on
    // every path or the stale mounted instance blocks the next edit.
    if (!val) onCloseRequest?.()
    setOpen(val)
    if (val && initialData) {
      setForm({
        name: initialData.name,
        email: initialData.email ?? '',
        role: initialData.role,
        department: initialData.department ?? '',
        photoUrl: initialData.photoUrl ?? '',
        phone: initialData.phone ?? '',
        status: initialData.status,
        researchAreas: initialData.researchAreas?.join(', ') ?? '',
      })
      setPhotoError(null)
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
            <Label className="text-xs">照片</Label>
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 border border-border">
                {/* AvatarImage 加载/解析失败时 Radix 自动回退到 AvatarFallback */}
                {form.photoUrl
                  ? <AvatarImage src={form.photoUrl} alt={form.name || '人员照片'} />
                  : null}
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {form.name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => void handlePhotoChange(e.target.files?.[0])}
                />
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                  disabled={photoUploading}
                  onClick={() => fileInputRef.current?.click()}>
                  {photoUploading ? <><Loader2 className="h-3 w-3 animate-spin" />上传中…</> : (form.photoUrl ? '更换照片' : '上传照片')}
                </Button>
                {form.photoUrl && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                    disabled={photoUploading}
                    onClick={() => setForm(prev => ({ ...prev, photoUrl: '' }))}>
                    移除
                  </Button>
                )}
              </div>
            </div>
            {photoError && <p className="text-xs text-destructive">{photoError}</p>}
            <p className="text-[10px] text-muted-foreground">支持 PNG / JPG / WebP，≤5MB。保存后显示在人员列表与详情。</p>
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
            <Label className="text-xs">职位/角色</Label>
            <Input
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              placeholder="如：研究员、博士生、工程师（钉钉同步自动填充）"
              className="h-9"
            />
            <p className="text-[10px] text-muted-foreground">同步钉钉成员时自动用钉钉职位填充；也可手动编辑。</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">部门</Label>
            <Input
              value={form.department}
              onChange={e => setForm({ ...form, department: e.target.value })}
              placeholder="如：算法组（钉钉同步自动填充）"
              className="h-9"
            />
            <p className="text-[10px] text-muted-foreground">同步钉钉成员时自动用所在部门填充；也可手动编辑。</p>
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
          <Button variant="outline" size="sm" onClick={() => { setOpen(false); onCloseRequest?.() }}>取消</Button>
          {/* 照片上传期间禁用保存：提交旧 URL 会丢掉刚上传的新照片 */}
          <Button size="sm" onClick={handleSubmit} disabled={!form.name || photoUploading}>{isEdit ? '保存' : '添加'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
