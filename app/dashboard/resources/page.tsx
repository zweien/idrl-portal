'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useResources, useCategories, updateResource } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { Resource } from '@/lib/types'
import { MarkdownContent } from '@/components/dashboard/markdown-content'
import { ResourceDialog } from '@/components/admin/resource-dialog'
import { cn } from '@/lib/utils'
import {
  Search,
  Server,
  Cpu,
  Database,
  GitBranch,
  BookOpen,
  Box,
  Cloud,
  Globe,
  Terminal,
  FileText,
  ExternalLink,
  Settings,
  X,
  Pencil,
} from 'lucide-react'

/** Name → lucide component, matching the admin icon picker choices. */
const iconByName: Record<string, React.ElementType> = {
  Cpu, Database, GitBranch, BookOpen, Box, Server, Cloud, Globe, Terminal, FileText,
}

/** Prefer a custom icon stored on the resource, fall back to a generic Server. */
function resolveIcon(resource: { icon?: string | null } | null): React.ElementType {
  if (resource?.icon && iconByName[resource.icon]) return iconByName[resource.icon]
  return Server
}

const statusConfig = {
  available:   { label: '可用',   className: 'bg-[var(--status-present)]/15 text-[var(--status-present)]' },
  maintenance: { label: '维护中', className: 'bg-[var(--status-absent)]/15 text-[var(--status-absent)]' },
  restricted:  { label: '受限',   className: 'bg-muted text-muted-foreground' },
}

const accessLabels: Record<string, string> = {
  public: '公开', member: '成员', admin: '管理员',
}

export default function ResourcesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { data: resourcesResp, mutate } = useResources({ pageSize: 1000 })
  const { data: catResp } = useCategories('resource')
  const resources = resourcesResp?.data?.items ?? []
  const categories = catResp?.data ?? []

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Resource | null>(null)
  // Inline edit (admin only). editNonce forces a dialog remount per open so
  // re-clicking the same item after a cancel still reopens it.
  const [editing, setEditing] = useState<Resource | null>(null)
  const [editNonce, setEditNonce] = useState(0)
  const [editError, setEditError] = useState<string | null>(null)

  const openEdit = (r: Resource) => { setEditing(r); setEditNonce(c => c + 1) }

  const handleEditSubmit = async (r: Resource) => {
    try {
      await updateResource(r.id, r)
      setEditing(null)
      setEditError(null)
      setSelected(prev => (prev?.id === r.id ? r : prev))
      void mutate()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '保存失败')
      throw e // keep the dialog open so edits aren't lost
    }
  }

  const catName = useMemo(() => {
    const m = new Map<string, string>()
    categories.forEach(c => m.set(c.id, c.name))
    return m
  }, [categories])

  const filtered = useMemo(() => resources.filter(r => {
    const matchSearch = !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = !categoryFilter || r.categoryId === categoryFilter
    return matchSearch && matchCat
  }), [search, categoryFilter, resources])

  const catCounts = useMemo(() => {
    const c = new Map<string, number>()
    resources.forEach(r => {
      const key = r.categoryId ?? '_none'
      c.set(key, (c.get(key) ?? 0) + 1)
    })
    return c
  }, [resources])

  if (!resourcesResp) {
    return (
      <div className="space-y-4 py-2">
        <h1 className="text-xl font-semibold tracking-tight">资源聚合</h1>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">资源聚合</h1>
          <p className="text-sm text-muted-foreground mt-0.5">访问实验室计算资源、存储空间、代码仓库等</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0" asChild>
            <Link href="/dashboard/admin?tab=resources">
              <Settings className="h-3.5 w-3.5" />管理
            </Link>
          </Button>
        )}
      </div>
      {editError && (
        <p className="text-xs text-destructive">编辑保存失败：{editError}</p>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索资源…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-56"
          />
        </div>
        <Button
          variant={categoryFilter === null ? 'secondary' : 'ghost'}
          size="sm" className="h-8 text-xs"
          onClick={() => setCategoryFilter(null)}
        >
          全部 ({resources.length})
        </Button>
        {categories.map(cat => {
          if (!catCounts.get(cat.id)) return null
          const Icon = resolveIcon(null)
          return (
            <Button
              key={cat.id}
              variant={categoryFilter === cat.id ? 'secondary' : 'ghost'}
              size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.name} ({catCounts.get(cat.id) ?? 0})
            </Button>
          )
        })}
      </div>

      {/* Content */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Resource list */}
        <div className="lg:col-span-2 space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center py-16 text-center">
              <Server className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">没有找到匹配的资源</p>
            </div>
          )}
          {filtered.map(resource => {
            const Icon = resolveIcon(resource)
            const sc   = statusConfig[resource.status]
            const isSelected = selected?.id === resource.id
            return (
              <button
                key={resource.id}
                onClick={() => setSelected(resource)}
                className={cn(
                  'w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors',
                  isSelected
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-card hover:bg-accent',
                )}
              >
                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{resource.name}</span>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', sc.className)}>
                      {sc.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{resource.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {resource.categoryId && (
                      <Badge variant="outline" className="text-[10px] font-normal h-4 px-1.5">
                        {catName.get(resource.categoryId) ?? '未分类'}
                      </Badge>
                    )}
                    {resource.url && (
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        访问 <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <span
                    role="button"
                    aria-label={`编辑 ${resource.name}`}
                    title="编辑"
                    className="shrink-0 p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
                    onClick={e => { e.stopPropagation(); openEdit(resource) }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Detail panel */}
        <div className="rounded-lg border border-border bg-card h-fit lg:sticky lg:top-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">资源详情</p>
            {selected && (
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => openEdit(selected)}>
                    <Pencil className="h-3 w-3" />编辑
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSelected(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
          <div className="p-4">
            {selected ? (() => {
              const Icon = resolveIcon(selected)
              const sc   = statusConfig[selected.status]
              return (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{selected.name}</p>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', sc.className)}>
                        {sc.label}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground leading-relaxed">
                    <MarkdownContent content={selected.description} />
                  </div>

                  {selected.specs && Object.keys(selected.specs).length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-2">配置规格</p>
                      <div className="space-y-1.5">
                        {Object.entries(selected.specs).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-xs py-1.5 px-2.5 rounded-md bg-muted/50">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-medium font-mono">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Settings className="h-3.5 w-3.5" />
                    <span>访问级别：{accessLabels[selected.accessLevel] ?? selected.accessLevel}</span>
                  </div>

                  {selected.url && (
                    <Button size="sm" className="w-full h-8 text-xs gap-1.5" asChild>
                      <a href={selected.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        访问资源
                      </a>
                    </Button>
                  )}
                </div>
              )
            })() : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Server className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">选择资源查看详情</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isAdmin && editing && (
        <ResourceDialog
          key={`${editing.id}-${editNonce}`}
          initialData={editing}
          // hide the dialog's default trigger — opening is driven by the pencils
          trigger={<span className="hidden" aria-hidden />}
          onSubmit={handleEditSubmit}
        />
      )}
    </div>
  )
}
