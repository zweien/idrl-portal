'use client'

import { useState } from 'react'
import type { NewsItem, NewsStatus } from '@/lib/types'
import { useCategories } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { Plus, Pencil } from 'lucide-react'

interface NewsDialogProps {
  initialData?: NewsItem
  trigger?: React.ReactNode
  onSubmit: (news: NewsItem) => void | Promise<void>
}

// datetime-local inputs emit a local wall-clock with no timezone
// ("YYYY-MM-DDTHH:mm"). Convert to a UTC ISO instant for storage so the
// scheduler's publishAt comparison (against new Date().toISOString()) means
// what the admin intended. isoToLocal is the inverse used to fill the input.
// Module-scope so the useState initializer (runs on the open-mount for edits)
// can use it — handleOpenChange is not called on first mount.
function localToIso(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return isNaN(d.getTime()) ? null : d.toISOString()
}
function isoToLocal(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // YYYY-MM-DDTHH:mm in the browser's local zone.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function NewsDialog({ initialData, trigger, onSubmit }: NewsDialogProps) {
  const isEdit = !!initialData
  const { data: catResp } = useCategories('news')
  const categories = catResp?.data ?? []
  const [open, setOpen] = useState(!!initialData)
  const [form, setForm] = useState({
    title: initialData?.title ?? '',
    categoryId: initialData?.categoryId ?? '',
    status: (initialData?.publishAt && initialData.status === 'draft' ? 'scheduled' : initialData?.status ?? 'published') as NewsStatus | 'scheduled',
    publishAt: isoToLocal(initialData?.publishAt),
    content: initialData?.content ?? '',
    summary: initialData?.summary ?? '',
    author: initialData?.author ?? '',
    date: initialData?.date ?? new Date().toISOString().slice(0, 10),
    tags: initialData?.tags?.join(', ') ?? '',
    pinned: initialData?.pinned ?? false,
    link: initialData?.link ?? '',
    imageUrl: initialData?.imageUrl ?? '',
  })

  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!form.title || submitting) return
    // 'scheduled' is a UI mode represented as status=draft + publishAt; the
    // scheduler flips draft→published once publishAt passes. publishAt is
    // cleared for non-scheduled modes so a draft stays a draft.
    const scheduled = form.status === 'scheduled'
    setSubmitting(true)
    try {
      // Close only after the parent confirms the save; a thrown error keeps
      // the dialog open so entered changes aren't lost on transient failures.
      await onSubmit({
        id: initialData?.id ?? `n-${Date.now()}`,
        title: form.title,
        content: form.content,
        summary: form.summary || undefined,
        author: form.author || undefined,
        date: form.date,
        tags: form.tags ? form.tags.split(/[,，]/).map(s => s.trim()).filter(Boolean) : undefined,
        pinned: form.pinned || undefined,
        link: form.link || undefined,
        imageUrl: form.imageUrl || undefined,
        status: (scheduled ? 'draft' : form.status === 'scheduled' ? 'published' : form.status) as NewsStatus,
        publishAt: scheduled ? localToIso(form.publishAt) : null,
        categoryId: form.categoryId || null,
      })
      setOpen(false)
    } catch {
      // parent surfaces the error
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (val && initialData) {
      setForm({
        title: initialData.title,
        categoryId: initialData.categoryId ?? '',
        status: (initialData.publishAt && initialData.status === 'draft' ? 'scheduled' : initialData.status) as NewsStatus | 'scheduled',
        publishAt: isoToLocal(initialData.publishAt),
        content: initialData.content,
        summary: initialData.summary ?? '',
        author: initialData.author ?? '',
        date: initialData.date,
        tags: initialData.tags?.join(', ') ?? '',
        pinned: initialData.pinned ?? false,
        link: initialData.link ?? '',
        imageUrl: initialData.imageUrl ?? '',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="h-8 text-xs gap-1.5">
            {isEdit ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {isEdit ? '编辑' : '发布动态'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑动态' : '发布新动态'}</DialogTitle>
          <DialogDescription>{isEdit ? '修改动态信息' : '填写动态内容，支持 Markdown 语法。'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-1.5">
            <Label className="text-xs">标题 *</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="动态标题" className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">分类</Label>
              <Select value={form.categoryId} onValueChange={v => setForm({ ...form, categoryId: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="选择分类" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">发布方式</Label>
              <Select value={form.status} onValueChange={(v: string) => setForm({ ...form, status: v as NewsStatus | 'scheduled' })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">立即发布</SelectItem>
                  <SelectItem value="draft">存为草稿</SelectItem>
                  <SelectItem value="scheduled">定时发布</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.status === 'scheduled' && (
            <div className="space-y-1.5">
              <Label className="text-xs">发布时间 *</Label>
              <Input
                type="datetime-local"
                value={form.publishAt}
                onChange={e => setForm({ ...form, publishAt: e.target.value })}
                className="h-9"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">摘要</Label>
            <Input value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} placeholder="简短摘要（可选）" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">内容（支持 Markdown）</Label>
            <Textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="支持 Markdown 语法" className="min-h-[200px] text-sm font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">作者</Label>
              <Input value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} placeholder="作者姓名" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">日期</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">标签（逗号分隔）</Label>
            <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="论文, NeurIPS, 强化学习" className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">原文链接</Label>
              <Input value={form.link} onChange={e => setForm({ ...form, link: e.target.value })} placeholder="https://…（可选）" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">配图 URL</Label>
              <Input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…/cover.jpg（可选）" className="h-9" />
            </div>
          </div>
          {form.imageUrl && (
            <div className="rounded-md border border-border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={form.imageUrl}
                src={form.imageUrl}
                alt="配图预览"
                className="w-full max-h-40 object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={form.pinned} onCheckedChange={val => setForm({ ...form, pinned: val })} />
            <Label className="text-xs">置顶</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !form.title || (form.status === 'scheduled' && !form.publishAt)}>{isEdit ? '保存' : '发布'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
