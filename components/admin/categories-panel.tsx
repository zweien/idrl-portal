'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCategories } from '@/lib/api'
import { Trash2, Plus } from 'lucide-react'
import { useSWRConfig } from 'swr'

function CategoryManager({ kind }: { kind: 'news' | 'resource' }) {
  const { data: resp, mutate } = useCategories(kind)
  const categories = resp?.data ?? []
  const { mutate: mutateGlobal } = useSWRConfig()
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  const refresh = () => { void mutate(); void mutateGlobal(`/api/categories?kind=${kind}`) }

  const handleAdd = async () => {
    if (!newName.trim()) return
    setError('')
    const r = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), kind }),
    })
    if (!r.ok) {
      const body = await r.json().catch(() => ({ error: 'failed' }))
      setError(body.error?.includes('unique') || body.error?.includes('constraint')
        ? '分类名已存在' : (body.error ?? '创建失败'))
      return
    }
    setNewName('')
    refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('删除此分类？关联的内容将变为"未分类"。')) return
    await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder={`新增${kind === 'news' ? '动态' : '资源'}分类`}
          className="h-8 text-sm max-w-xs"
        />
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleAdd} disabled={!newName.trim()}>
          <Plus className="h-3.5 w-3.5" />添加
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无分类</p>
        ) : categories.map(c => (
          <div key={c.id} className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
            <span className="text-xs">{c.name}</span>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(c.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CategoriesPanel() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-medium">分类管理</p>
        <p className="text-xs text-muted-foreground mt-0.5">统一管理动态与资源的分类，删除分类后关联内容变为"未分类"。</p>
      </div>
      <div className="p-4">
        <Tabs defaultValue="news">
          <TabsList className="h-8 p-1">
            <TabsTrigger value="news" className="text-xs h-6">动态分类</TabsTrigger>
            <TabsTrigger value="resource" className="text-xs h-6">资源分类</TabsTrigger>
          </TabsList>
          <TabsContent value="news" className="mt-3"><CategoryManager kind="news" /></TabsContent>
          <TabsContent value="resource" className="mt-3"><CategoryManager kind="resource" /></TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
