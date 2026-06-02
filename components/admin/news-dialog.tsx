'use client'

import { useState } from 'react'
import type { NewsItem, NewsType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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

const typeLabels: Record<NewsType, string> = {
  paper: '论文发表', notice: '实验室通知', event: '最新活动', achievement: '荣誉成就',
}

interface NewsDialogProps {
  initialData?: NewsItem
  trigger?: React.ReactNode
  onSubmit: (news: NewsItem) => void
}

export function NewsDialog({ initialData, trigger, onSubmit }: NewsDialogProps) {
  const isEdit = !!initialData
  const [open, setOpen] = useState(!!initialData)
  const [form, setForm] = useState({
    title: initialData?.title ?? '',
    type: initialData?.type ?? ('notice' as NewsType),
    content: initialData?.content ?? '',
    summary: initialData?.summary ?? '',
    author: initialData?.author ?? '',
    date: initialData?.date ?? new Date().toISOString().slice(0, 10),
    tags: initialData?.tags?.join(', ') ?? '',
    pinned: initialData?.pinned ?? false,
  })

  const handleSubmit = () => {
    if (!form.title) return
    onSubmit({
      id: initialData?.id ?? `n-${Date.now()}`,
      type: form.type,
      title: form.title,
      content: form.content,
      summary: form.summary || undefined,
      author: form.author || undefined,
      date: form.date,
      tags: form.tags ? form.tags.split(/[,，]/).map(s => s.trim()).filter(Boolean) : undefined,
      pinned: form.pinned || undefined,
    })
    setOpen(false)
  }

  const handleOpenChange = (val: boolean) => {
    setOpen(val)
    if (val && initialData) {
      setForm({
        title: initialData.title,
        type: initialData.type,
        content: initialData.content,
        summary: initialData.summary ?? '',
        author: initialData.author ?? '',
        date: initialData.date,
        tags: initialData.tags?.join(', ') ?? '',
        pinned: initialData.pinned ?? false,
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
          <div className="space-y-1.5">
            <Label className="text-xs">类型</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(typeLabels) as [NewsType, string][]).map(([v, l]) => (
                <Button key={v} type="button" size="sm" variant={form.type === v ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setForm({ ...form, type: v })}>
                  {l}
                </Button>
              ))}
            </div>
          </div>
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
          <div className="flex items-center gap-2">
            <Switch checked={form.pinned} onCheckedChange={val => setForm({ ...form, pinned: val })} />
            <Label className="text-xs">置顶</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!form.title}>{isEdit ? '保存' : '发布'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
