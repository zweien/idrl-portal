'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNews, useCategories, updateNews } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import type { NewsItem } from '@/lib/types'
import { MarkdownContent } from '@/components/dashboard/markdown-content'
import { NewsDialog } from '@/components/admin/news-dialog'
import {
  Search,
  Newspaper,
  Calendar,
  Pin,
  Clock,
  User,
  Tag,
  ArrowLeft,
  Pencil,
  Settings,
} from 'lucide-react'

export default function NewsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { data: newsResp, mutate } = useNews({ pageSize: 1000 })
  const { data: catResp } = useCategories('news')
  const news = newsResp?.data?.items ?? []
  const categories = catResp?.data ?? []

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<NewsItem | null>(null)
  // Inline edit (admin only). editNonce forces a dialog remount per open so
  // re-clicking the same item after a cancel still reopens it.
  const [editing, setEditing] = useState<NewsItem | null>(null)
  const [editNonce, setEditNonce] = useState(0)
  const [editError, setEditError] = useState<string | null>(null)

  const openEdit = (n: NewsItem) => { setEditing(n); setEditNonce(c => c + 1) }

  const handleEditSubmit = async (n: NewsItem) => {
    try {
      await updateNews(n.id, n)
      setEditing(null)
      setEditError(null)
      // An item flipped to draft/scheduled disappears from the reader feed;
      // don't keep showing it in the detail view.
      setSelected(prev => (prev?.id === n.id ? (n.status === 'published' ? n : null) : prev))
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

  const filtered = useMemo(() => news.filter(n => {
    const matchSearch = !search ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.content.toLowerCase().includes(search.toLowerCase()) ||
      n.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()))
    const matchCat = !categoryFilter || n.categoryId === categoryFilter
    return matchSearch && matchCat
  }).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  }), [search, categoryFilter, news])

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    news.forEach(n => {
      const key = n.categoryId ?? '_none'
      c.set(key, (c.get(key) ?? 0) + 1)
    })
    return c
  }, [news])

  if (!newsResp) {
    return (
      <div className="space-y-4 py-2">
        <h1 className="text-xl font-semibold tracking-tight">最新动态</h1>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">最新动态</h1>
          <p className="text-sm text-muted-foreground mt-0.5">实验室论文发表、通知公告、活动信息</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0" asChild>
            <Link href="/dashboard/admin?tab=news">
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
            placeholder="搜索标题、内容或标签…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-64"
          />
        </div>
        <Button
          variant={categoryFilter === null ? 'secondary' : 'ghost'}
          size="sm" className="h-8 text-xs"
          onClick={() => setCategoryFilter(null)}
        >
          全部 ({news.length})
        </Button>
        {categories.map(cat => (
          <Button
            key={cat.id}
            variant={categoryFilter === cat.id ? 'secondary' : 'ghost'}
            size="sm" className="h-8 text-xs gap-1.5"
            onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)}
          >
            <Newspaper className="h-3.5 w-3.5 text-muted-foreground" />
            {cat.name} ({counts.get(cat.id) ?? 0})
          </Button>
        ))}
      </div>

      {/* Content */}
      {selected ? (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setSelected(null)}>
              <ArrowLeft className="h-3.5 w-3.5" />返回列表
            </Button>
            <div className="flex items-center gap-1.5 flex-wrap">
              {selected.categoryId && (
                <Badge variant="outline" className="text-xs font-normal gap-1">
                  <Newspaper className="h-3 w-3" />
                  {catName.get(selected.categoryId) ?? '未分类'}
                </Badge>
              )}
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
              {isAdmin && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(selected)}>
                  <Pencil className="h-3 w-3" />编辑
                </Button>
              )}
            </div>
          </div>
          <div className="px-6 py-6 max-w-none">
            <h2 className="text-lg font-semibold leading-snug mb-4">{selected.title}</h2>
            {selected.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={selected.imageUrl}
                alt={selected.title}
                className="w-full max-h-80 object-cover rounded-md mb-4"
              />
            )}
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
          {filtered.map(news => (
            <button
              key={news.id}
              onClick={() => setSelected(news)}
              className="w-full flex gap-3 p-4 rounded-lg border border-border bg-card text-left transition-colors hover:bg-accent"
            >
              <Newspaper className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  {news.categoryId && (
                    <Badge variant="outline" className="text-[10px] font-normal h-4 px-1.5">
                      {catName.get(news.categoryId) ?? '未分类'}
                    </Badge>
                  )}
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
              {isAdmin && (
                <span
                  role="button"
                  aria-label={`编辑 ${news.title}`}
                  title="编辑"
                  className="shrink-0 self-start p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
                  onClick={e => { e.stopPropagation(); openEdit(news) }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {isAdmin && editing && (
        <NewsDialog
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
