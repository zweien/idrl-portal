'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mockNews } from '@/lib/mock-data'
import type { NewsItem, NewsType } from '@/lib/types'
import { MarkdownContent } from '@/components/dashboard/markdown-content'
import { cn } from '@/lib/utils'
import {
  Search,
  FileText,
  Newspaper,
  Calendar,
  Award,
  Pin,
  Clock,
  User,
  Tag,
  ArrowLeft,
} from 'lucide-react'

const typeIcons: Record<NewsType, React.ElementType> = {
  paper:       FileText,
  notice:      Newspaper,
  event:       Calendar,
  achievement: Award,
}

const typeLabels: Record<NewsType, string> = {
  paper:       '论文发表',
  notice:      '实验室通知',
  event:       '最新活动',
  achievement: '荣誉成就',
}

const typeColors: Record<NewsType, string> = {
  paper:       'text-[var(--chart-1)]',
  notice:      'text-[var(--chart-2)]',
  event:       'text-[var(--chart-3)]',
  achievement: 'text-[var(--chart-4)]',
}

export default function NewsPage() {
  const [search, setSearch]             = useState('')
  const [typeFilter, setTypeFilter]     = useState<NewsType | null>(null)
  const [selected, setSelected]         = useState<NewsItem | null>(null)

  const filtered = useMemo(() => mockNews.filter(n => {
    const matchSearch = !search ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase()) ||
      n.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
    const matchType = !typeFilter || n.type === typeFilter
    return matchSearch && matchType
  }).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  }), [search, typeFilter])

  const counts = useMemo(() => {
    const c: Record<NewsType, number> = { paper: 0, notice: 0, event: 0, achievement: 0 }
    mockNews.forEach(n => c[n.type]++)
    return c
  }, [])

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">最新动态</h1>
        <p className="text-sm text-muted-foreground mt-0.5">实验室论文发表、通知公告、活动信息</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索标题、内容或标签…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-64"
          />
        </div>
        <Button
          variant={typeFilter === null ? 'secondary' : 'ghost'}
          size="sm" className="h-8 text-xs"
          onClick={() => setTypeFilter(null)}
        >
          全部 ({mockNews.length})
        </Button>
        {(Object.keys(typeLabels) as NewsType[]).map(type => {
          const Icon = typeIcons[type]
          return (
            <Button
              key={type}
              variant={typeFilter === type ? 'secondary' : 'ghost'}
              size="sm" className="h-8 text-xs gap-1.5"
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
            >
              <Icon className={cn('h-3.5 w-3.5', typeColors[type])} />
              {typeLabels[type]} ({counts[type]})
            </Button>
          )
        })}
      </div>

      {/* Content */}
      {selected ? (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-3.5 w-3.5" />返回列表
            </Button>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(() => {
                const Icon = typeIcons[selected.type]
                return (
                  <Badge variant="outline" className="text-xs font-normal gap-1">
                    <Icon className={cn('h-3 w-3', typeColors[selected.type])} />
                    {typeLabels[selected.type]}
                  </Badge>
                )
              })()}
              {selected.pinned && (
                <Badge variant="secondary" className="text-xs font-normal gap-1">
                  <Pin className="h-3 w-3" />置顶
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{selected.date}
              </span>
              {selected.author && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />{selected.author}
                </span>
              )}
            </div>
          </div>
          <div className="px-6 py-6 max-w-none">
            <h2 className="text-lg font-semibold leading-snug mb-4">{selected.title}</h2>
            <MarkdownContent content={selected.content} />
            {selected.tags && selected.tags.length > 0 && (
              <div className="pt-4 mt-6 border-t border-border flex items-center gap-1.5 flex-wrap">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                {selected.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs font-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {selected.link && (
              <div className="mt-6">
                <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
                  <a href={selected.link} target="_blank" rel="noopener noreferrer">
                    查看更多
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center py-16 text-center">
              <Newspaper className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">没有找到匹配的动态</p>
            </div>
          )}
          {filtered.map(news => {
            const Icon = typeIcons[news.type]
            return (
              <button
                key={news.id}
                onClick={() => setSelected(news)}
                className="w-full flex gap-3 p-4 rounded-lg border border-border bg-card text-left transition-colors hover:bg-accent"
              >
                <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', typeColors[news.type])} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-normal h-4 px-1.5">
                      {typeLabels[news.type]}
                    </Badge>
                    {news.pinned && (
                      <Badge variant="secondary" className="text-[10px] font-normal h-4 px-1.5 gap-0.5">
                        <Pin className="h-2.5 w-2.5" />置顶
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-snug line-clamp-2">{news.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {news.summary ?? news.content}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />{news.date}
                    </span>
                    {news.author && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />{news.author}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
