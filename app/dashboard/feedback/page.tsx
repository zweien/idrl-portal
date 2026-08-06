'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  MessageSquarePlus,
  Reply,
  Trash2,
  CheckCircle2,
  CircleDot,
  ArrowLeft,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import {
  useFeedback,
  useFeedbackDetail,
  createFeedback,
  deleteFeedback,
  updateFeedbackStatus,
  createFeedbackReply,
  deleteFeedbackReply,
} from '@/lib/api'
import type { FeedbackCategory, FeedbackStatus } from '@/lib/types'

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: '问题反馈',
  suggestion: '建议',
  question: '疑问',
  other: '其他',
}

const CATEGORY_BADGE: Record<FeedbackCategory, string> = {
  bug: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  suggestion: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  question: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  other: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export default function FeedbackPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [pageSize, setPageSize] = useState(20) // grows via "load more"

  const params: Record<string, string | number> = { pageSize }
  if (statusFilter !== 'all') params.status = statusFilter
  if (categoryFilter !== 'all') params.category = categoryFilter
  const { data: listResp, mutate: mutateList } = useFeedback(params)
  const list = listResp?.data?.items ?? []
  const total = listResp?.data?.total ?? 0
  const hasMore = list.length < total

  // Detail view is a separate SWR fetch keyed on selectedId.
  const detail = useFeedbackDetail(selectedId)
  const detailPost = detail.data?.data?.post
  const detailReplies = detail.data?.data?.replies ?? []

  if (selectedId) {
    return (
      <FeedbackDetail
        onBack={() => setSelectedId(null)}
        post={detailPost}
        replies={detailReplies}
        isAdmin={isAdmin}
        currentUserId={user?.id}
        onStatusChange={async (status) => {
          try {
            await updateFeedbackStatus(selectedId, status)
            toast.success(`已标记为「${status === 'resolved' ? '已处理' : '待处理'}」`)
            void detail.mutate()
            void mutateList()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : '操作失败')
          }
        }}
        onDelete={async () => {
          if (!window.confirm('确定删除这条反馈？其下回复将一并删除。')) return
          try {
            await deleteFeedback(selectedId)
            toast.success('已删除')
            setSelectedId(null)
            void mutateList()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : '删除失败')
          }
        }}
        onReply={async (content: string) => {
          await createFeedbackReply(selectedId, content)
          void detail.mutate()
          void mutateList()
        }}
        onDeleteReply={async (replyId: string) => {
          try {
            await deleteFeedbackReply(selectedId, replyId)
            void detail.mutate()
            void mutateList()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : '删除失败')
          }
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">问题反馈</h1>
          <p className="text-sm text-muted-foreground mt-1">
            提交使用中遇到的问题或建议，管理员会跟进处理。
          </p>
        </div>
        <Button onClick={() => setComposing(true)}>
          <MessageSquarePlus className="h-4 w-4 mr-1.5" />发起反馈
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as FeedbackStatus | 'all'); setPageSize(20) }}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="open">待处理</SelectItem>
            <SelectItem value="resolved">已处理</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v as FeedbackCategory | 'all'); setPageSize(20) }}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="分类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            <SelectItem value="bug">问题反馈</SelectItem>
            <SelectItem value="suggestion">建议</SelectItem>
            <SelectItem value="question">疑问</SelectItem>
            <SelectItem value="other">其他</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {!listResp ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">暂无反馈，点击「发起反馈」提交第一条。</p>
      ) : (
        <div className="space-y-2">
          {list.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedId(f.id)}
              className="w-full text-left rounded-lg border border-border bg-card p-4 hover:border-foreground/20 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_BADGE[f.category]}`}>
                      {CATEGORY_LABELS[f.category]}
                    </span>
                    {f.status === 'resolved' ? (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" />已处理
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <CircleDot className="h-2.5 w-2.5" />待处理
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm line-clamp-2">{f.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{f.authorName}</span>
                    <span>{formatTime(f.createdAt)}</span>
                    {f.replyCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Reply className="h-3 w-3" />{f.replyCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {hasMore && (
            <div className="pt-2 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setPageSize((n) => n + 20)}>
                加载更多（还有 {total - list.length} 条）
              </Button>
            </div>
          )}
        </div>
      )}

      <ComposeDialog
        open={composing}
        onOpenChange={setComposing}
        onSubmit={async (data) => {
          await createFeedback(data)
          toast.success('反馈已提交')
          void mutateList()
        }}
      />
    </div>
  )
}

function formatTime(iso: string): string {
  // Show date + HH:mm; older than a year shows just the date.
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Detail view: a post + its replies + the reply box. */
function FeedbackDetail(props: {
  onBack: () => void
  post?: { id: string; authorName: string; content: string; category: FeedbackCategory; status: FeedbackStatus; contact?: string | null; createdAt: string; userId: string }
  replies: Array<{ id: string; authorName: string; content: string; createdAt: string; userId: string }>
  isAdmin: boolean
  currentUserId?: string
  onStatusChange: (status: FeedbackStatus) => Promise<void>
  onDelete: () => Promise<void>
  onReply: (content: string) => Promise<void>
  onDeleteReply: (replyId: string) => Promise<void>
}) {
  const { onBack, post, replies, isAdmin, currentUserId, onStatusChange, onDelete, onReply, onDeleteReply } = props
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!post) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />返回</Button>
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    )
  }

  const canDeletePost = isAdmin || post.userId === currentUserId

  const submitReply = async () => {
    if (!replyText.trim() || submitting) return
    setSubmitting(true)
    try {
      await onReply(replyText.trim())
      setReplyText('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '回复失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />返回列表</Button>

      {/* Post */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_BADGE[post.category]}`}>
              {CATEGORY_LABELS[post.category]}
            </span>
            {post.status === 'resolved' ? (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />已处理
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] gap-1">
                <CircleDot className="h-2.5 w-2.5" />待处理
              </Badge>
            )}
          </div>
          {isAdmin && (
            <Select
              value={post.status}
              onValueChange={(v) => void onStatusChange(v as FeedbackStatus)}
            >
              <SelectTrigger className="w-[110px] h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">待处理</SelectItem>
                <SelectItem value="resolved">已处理</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.content}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{post.authorName}</span>
          <span>{formatTime(post.createdAt)}</span>
          {post.contact && <span className="text-muted-foreground/70">联系：{post.contact}</span>}
        </div>
        {canDeletePost && (
          <div className="pt-2 border-t border-border">
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-destructive" onClick={() => void onDelete()}>
              <Trash2 className="h-3 w-3 mr-1" />删除
            </Button>
          </div>
        )}
      </div>

      {/* Replies */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">回复（{replies.length}）</h3>
        {replies.map((r) => {
          const canDeleteReply = isAdmin || r.userId === currentUserId
          return (
            <div key={r.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.authorName}</span>
                  <span>{formatTime(r.createdAt)}</span>
                </div>
                {canDeleteReply && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void onDeleteReply(r.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap">{r.content}</p>
            </div>
          )
        })}
        {replies.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">还没有回复，留下第一条。</p>
        )}
      </div>

      {/* Reply box */}
      <div className="space-y-2">
        <Textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="写下你的回复…"
          rows={3}
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={!replyText.trim() || submitting} onClick={() => void submitReply()}>
            <Reply className="h-3.5 w-3.5 mr-1" />回复
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Compose-new-post dialog. */
function ComposeDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmit: (data: { content: string; category: FeedbackCategory; contact?: string | null }) => Promise<void>
}) {
  const { open, onOpenChange, onSubmit } = props
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!content.trim() || content.trim().length < 5 || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({ content: content.trim(), category, contact: contact.trim() || null })
      setContent(''); setCategory('bug'); setContact('')
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>发起反馈</DialogTitle>
          <DialogDescription>描述你遇到的问题或建议，便于管理员跟进。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="fb-category">分类</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as FeedbackCategory)}>
              <SelectTrigger id="fb-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">问题反馈</SelectItem>
                <SelectItem value="suggestion">建议</SelectItem>
                <SelectItem value="question">疑问</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-content">内容</Label>
            <Textarea
              id="fb-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="详细描述问题（至少 5 个字）"
              rows={5}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground">{content.length}/2000</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-contact">联系方式（可选）</Label>
            <Input
              id="fb-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="便于回访：手机/邮箱/办公室"
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void submit()} disabled={content.trim().length < 5 || submitting}>
            {submitting ? '提交中…' : '提交'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
