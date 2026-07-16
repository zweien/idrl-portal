'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MarkdownContent } from '@/components/dashboard/markdown-content'
import { useAdminData } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { NewsItem, NewsType } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Users,
  Monitor,
  Server,
  ArrowRight,
  FileText,
  Newspaper,
  Calendar,
  Award,
  Pin,
  Clock,
  User,
  X,
  ChevronDown,
} from 'lucide-react'

const typeConfig: Record<NewsType, { icon: React.ElementType; label: string; color: string; accent: string }> = {
  paper:       { icon: FileText,    label: '论文发表',   color: 'text-[var(--chart-1)]', accent: 'bg-[var(--chart-1)]/8 border-[var(--chart-1)]/20' },
  notice:      { icon: Newspaper,   label: '实验室通知', color: 'text-[var(--chart-2)]', accent: 'bg-[var(--chart-2)]/8 border-[var(--chart-2)]/20' },
  event:       { icon: Calendar,    label: '最新活动',   color: 'text-[var(--chart-3)]', accent: 'bg-[var(--chart-3)]/8 border-[var(--chart-3)]/20' },
  achievement: { icon: Award,       label: '荣誉成就',   color: 'text-[var(--chart-4)]', accent: 'bg-[var(--chart-4)]/8 border-[var(--chart-4)]/20' },
}

function StatCard({ label, value, sub, icon: Icon }: {
  label: string; value: string; sub?: string; icon: React.ElementType
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}{sub && <span className="ml-1 text-muted-foreground/60">{sub}</span>}</p>
      </div>
    </div>
  )
}

function NewsCard({ news, onExpand }: { news: NewsItem; onExpand: (n: NewsItem) => void }) {
  const cfg = typeConfig[news.type]
  const Icon = cfg.icon

  return (
    <button
      onClick={() => onExpand(news)}
      className={cn(
        'w-full text-left rounded-lg border bg-card p-4 transition-all hover:shadow-sm hover:border-border/80',
        news.pinned && cfg.accent
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5', cfg.accent)}>
          <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <Badge variant="outline" className="text-[10px] font-normal h-4 px-1.5">
              {cfg.label}
            </Badge>
            {news.pinned && (
              <Badge variant="secondary" className="text-[10px] font-normal h-4 px-1.5 gap-0.5">
                <Pin className="h-2.5 w-2.5" />置顶
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium leading-snug line-clamp-2">{news.title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {news.summary}
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
      </div>
    </button>
  )
}

function NewsExpandModal({ news, onClose }: { news: NewsItem; onClose: () => void }) {
  const cfg = typeConfig[news.type]
  const Icon = cfg.icon

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-foreground/20 backdrop-blur-[2px]" onClick={onClose} />
      {/* Panel */}
      <div className="relative w-full max-w-2xl mx-4 my-8 rounded-xl border border-border bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className={cn('w-7 h-7 rounded-md flex items-center justify-center', cfg.accent)}>
              <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs font-normal gap-1">
                {cfg.label}
              </Badge>
              {news.pinned && (
                <Badge variant="secondary" className="text-xs font-normal gap-1">
                  <Pin className="h-3 w-3" />置顶
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold leading-snug">{news.title}</h2>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
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
          <Separator />
          <MarkdownContent content={news.content} />
          {news.tags && news.tags.length > 0 && (
            <>
              <Separator />
              <div className="flex items-center gap-1.5 flex-wrap">
                {news.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs font-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { data } = useAdminData()
  const personnel = data?.personnel ?? []
  const resources = data?.resources ?? []
  const news = data?.news ?? []
  const [expandedNews, setExpandedNews] = useState<NewsItem | null>(null)

  const personnelStats = useMemo(() => ({
    total: personnel.length,
    present: personnel.filter(p => p.status === 'present').length,
    trip: personnel.filter(p => p.status === 'trip').length,
    leave: personnel.filter(p => p.status === 'leave').length,
    absent: personnel.filter(p => p.status === 'absent').length,
  }), [personnel])

  const availableCount = useMemo(
    () => resources.filter(r => r.status === 'available').length,
    [resources],
  )

  const pinnedNews = useMemo(() => news.filter(n => n.pinned), [news])

  const groupedNews = useMemo(() => {
    const groups: Record<NewsType, NewsItem[]> = { paper: [], notice: [], event: [], achievement: [] }
    news.forEach(n => { if (!n.pinned) groups[n.type].push(n) })
    return groups
  }, [news])

  const orderedTypes: NewsType[] = ['paper', 'notice', 'event', 'achievement']

  if (!data) {
    return (
      <div className="space-y-4 py-2">
        <h1 className="text-xl font-semibold tracking-tight">仪表盘</h1>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-2">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          你好，{user?.name ?? '用户'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          IDRL 实验室门户 — 查看人员在位、资源与最新动态
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users}   label="在位人员" value={`${personnelStats.present}/${personnelStats.total}`} />
        <StatCard icon={Monitor} label="工位使用" value="查看详情" sub="→ 人员工位" />
        <StatCard icon={Server}  label="可用资源" value={`${availableCount}/${resources.length}`} />
        <StatCard icon={Pin}     label="置顶动态" value={String(pinnedNews.length)} />
      </div>

      {/* Pinned news */}
      {pinnedNews.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Pin className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">置顶公告</span>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            {pinnedNews.map(news => (
              <NewsCard key={news.id} news={news} onExpand={setExpandedNews} />
            ))}
          </div>
        </div>
      )}

      {/* Categorized news */}
      <div className="space-y-6">
        {orderedTypes.map(type => {
          const items = groupedNews[type]
          if (items.length === 0) return null
          const cfg = typeConfig[type]
          const Icon = cfg.icon
          return (
            <section key={type}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', cfg.color)} />
                  <span className="text-sm font-medium">{cfg.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
                </div>
                <Link href="/dashboard/news">
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
                    查看全部 <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
                {items.map(news => (
                  <NewsCard key={news.id} news={news} onExpand={setExpandedNews} />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {/* Quick access */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">快速访问</span>
          </div>
          <Link href="/dashboard/resources">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
              查看全部 <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {resources.slice(0, 6).map((resource) => (
            <a
              key={resource.id}
              href={resource.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-3 rounded-md border border-border hover:bg-accent hover:border-border transition-colors group"
            >
              <Server className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="text-xs font-medium text-center line-clamp-2 leading-tight">
                {resource.name}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                resource.status === 'available'
                  ? 'bg-[var(--status-present)]/15 text-[var(--status-present)]'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {resource.status === 'available' ? '可用' : '维护'}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Expand modal */}
      {expandedNews && (
        <NewsExpandModal news={expandedNews} onClose={() => setExpandedNews(null)} />
      )}
    </div>
  )
}
