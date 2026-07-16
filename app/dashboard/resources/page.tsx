'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useResources } from '@/lib/api'
import type { Resource, ResourceType } from '@/lib/types'
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
} from 'lucide-react'

const typeIcons: Record<ResourceType, React.ElementType> = {
  compute: Cpu,
  storage: Database,
  code:    GitBranch,
  docs:    BookOpen,
  other:   Box,
}

/** Name → lucide component, matching the admin icon picker choices. */
const iconByName: Record<string, React.ElementType> = {
  Cpu, Database, GitBranch, BookOpen, Box, Server, Cloud, Globe, Terminal, FileText,
}

/** Prefer a custom icon stored on the resource, fall back to the type default. */
function resolveIcon(resource: { icon?: string | null; type: ResourceType }): React.ElementType {
  if (resource.icon && iconByName[resource.icon]) return iconByName[resource.icon]
  return typeIcons[resource.type]
}

const typeLabels: Record<ResourceType, string> = {
  compute: '计算资源',
  storage: '存储资源',
  code:    '代码仓库',
  docs:    '文档资料',
  other:   '其他',
}

const statusConfig = {
  available:   { label: '可用',   className: 'bg-[var(--status-online)]/15 text-[var(--status-online)]' },
  maintenance: { label: '维护中', className: 'bg-[var(--status-busy)]/15 text-[var(--status-busy)]' },
  restricted:  { label: '受限',   className: 'bg-muted text-muted-foreground' },
}

const accessLabels: Record<string, string> = {
  public: '公开', member: '成员', admin: '管理员',
}

export default function ResourcesPage() {
  const { data: resourcesResp } = useResources({ pageSize: 1000 })
  const resources = resourcesResp?.data?.items ?? []

  const [search, setSearch]                         = useState('')
  const [typeFilter, setTypeFilter]                 = useState<ResourceType | null>(null)
  const [selected, setSelected]                     = useState<Resource | null>(null)

  const filtered = useMemo(() => resources.filter(r => {
    const matchSearch = !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase())
    const matchType = !typeFilter || r.type === typeFilter
    return matchSearch && matchType
  }), [search, typeFilter, resources])

  const typeCounts = useMemo(() => {
    const c: Record<ResourceType, number> = { compute: 0, storage: 0, code: 0, docs: 0, other: 0 }
    resources.forEach(r => c[r.type]++)
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">资源聚合</h1>
        <p className="text-sm text-muted-foreground mt-0.5">访问实验室计算资源、存储空间、代码仓库等</p>
      </div>

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
          variant={typeFilter === null ? 'secondary' : 'ghost'}
          size="sm" className="h-8 text-xs"
          onClick={() => setTypeFilter(null)}
        >
          全部 ({resources.length})
        </Button>
        {(Object.keys(typeLabels) as ResourceType[]).map(type => {
          const Icon = typeIcons[type]
          if (!typeCounts[type]) return null
          return (
            <Button
              key={type}
              variant={typeFilter === type ? 'secondary' : 'ghost'}
              size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
            >
              <Icon className="h-3.5 w-3.5" />
              {typeLabels[type]} ({typeCounts[type]})
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
                    : 'border-border bg-card hover:bg-accent'
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
                    <Badge variant="outline" className="text-[10px] font-normal h-4 px-1.5">
                      {typeLabels[resource.type]}
                    </Badge>
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
              </button>
            )
          })}
        </div>

        {/* Detail panel */}
        <div className="rounded-lg border border-border bg-card h-fit lg:sticky lg:top-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">资源详情</p>
            {selected && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSelected(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
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

                  <p className="text-sm text-muted-foreground leading-relaxed">{selected.description}</p>

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
    </div>
  )
}
