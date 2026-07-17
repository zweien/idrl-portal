'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAdminData, createPerson, updatePerson, deletePerson, createResource, updateResource, deleteResource, createNews, updateNews, deleteNews } from '@/lib/api'
import type { Person, Resource, NewsItem } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { PersonDialog } from '@/components/admin/person-dialog'
import { ResourceDialog } from '@/components/admin/resource-dialog'
import { NewsDialog } from '@/components/admin/news-dialog'
import {
  Users, Server, Newspaper, Pencil, Trash2,
  Database, AlertTriangle, CheckCircle, Info,
  ShieldAlert, MapPin, RefreshCw,
} from 'lucide-react'

/* ── Labels ─────────────────────────────────────── */
const roleLabels: Record<Person['role'], string> = {
  professor: '教授', postdoc: '博士后', phd: '博士生',
  master: '硕士生', undergraduate: '本科生', staff: '行政人员',
}
const statusLabels = { present: '在位', trip: '出差', leave: '请假', absent: '未到' }
const typeLabels   = { compute: '计算资源', storage: '存储资源', code: '代码仓库', docs: '文档资料', other: '其他' }
const newsLabels   = { paper: '论文发表', notice: '实验室通知', event: '最新活动', achievement: '荣誉成就' }

/* ── Generic table ──────────────────────────────── */
function DataTable<T extends { id: string }>({
  data, columns, onEdit, onDelete,
}: {
  data: T[]
  columns: { key: keyof T; label: string; render?: (v: T[keyof T], item: T) => React.ReactNode }[]
  onEdit: (item: T) => void
  onDelete: (item: T) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map(col => (
              <th key={String(col.key)} className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground">
                {col.label}
              </th>
            ))}
            <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map(item => (
            <tr key={item.id} className="hover:bg-muted/30 transition-colors">
              {columns.map(col => (
                <td key={String(col.key)} className="py-2.5 px-3 text-sm">
                  {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? '-')}
                </td>
              ))}
              <td className="py-2.5 px-3 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => onEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(item)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">暂无数据</div>
      )}
    </div>
  )
}

/* ── Integration status card ────────────────────── */
function IntegrationCard({ name, status, description }: {
  name: string
  status: 'connected' | 'pending' | 'error' | 'mock'
  description: string
}) {
  const cfg = {
    connected: { icon: CheckCircle, color: 'text-[var(--status-present)]', label: '已连接' },
    pending:   { icon: Info,         color: 'text-muted-foreground',        label: '待配置' },
    error:     { icon: AlertTriangle,color: 'text-destructive',             label: '连接失败' },
    mock:      { icon: Database,     color: 'text-primary',                 label: '模拟数据' },
  }[status]
  const Icon = cfg.icon

  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{name}</span>
        <Icon className={cn('h-4 w-4', cfg.color)} />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Badge variant="outline" className="text-[10px] font-normal">{cfg.label}</Badge>
    </div>
  )
}

/* ── API endpoint card ──────────────────────────── */
function ApiCard({ method, endpoint, description }: { method: string; endpoint: string; description: string }) {
  return (
    <div className="rounded-md border border-border p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <Badge
          variant={method === 'GET' ? 'secondary' : 'default'}
          className="text-[10px] font-mono px-1.5 py-0 h-4"
        >
          {method}
        </Badge>
        <code className="text-xs font-mono text-primary">{endpoint}</code>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

/* ── Page ───────────────────────────────────────── */
export default function AdminPage() {
  const { user } = useAuth()
  // Server state via SWR
  const { data, mutate } = useAdminData()

  // SSO provider availability (derived from env config server-side) so the
  // integration cards reflect real availability rather than a hardcoded status.
  const [providers, setProviders] = useState<{ authentik: boolean; dingtalk: boolean }>({ authentik: false, dingtalk: false })
  useEffect(() => {
    fetch('/api/auth/providers', { cache: 'no-store' })
      .then(r => r.json())
      .then((p: { authentik?: boolean; dingtalk?: boolean }) => setProviders({ authentik: !!p.authentik, dingtalk: !!p.dingtalk }))
      .catch(() => {})
  }, [])

  // Local draft state (null = not yet loaded)
  const [personnelData, setPersonnelData] = useState<Person[] | null>(null)
  const [resourcesData, setResourcesData] = useState<Resource[] | null>(null)
  const [newsData, setNewsData]           = useState<NewsItem[] | null>(null)

  // Sync server → local on first load
  useEffect(() => {
    if (data?.personnel && personnelData === null) setPersonnelData(data.personnel)
  }, [data?.personnel, personnelData])
  useEffect(() => {
    if (data?.resources && resourcesData === null) setResourcesData(data.resources)
  }, [data?.resources, resourcesData])
  useEffect(() => {
    if (data?.news && newsData === null) setNewsData(data.news)
  }, [data?.news, newsData])

  // Dirty = any of the three differs from server
  // Per-action persistence (single-item endpoints). Each mutation is optimistic:
  // update local state immediately, call the endpoint, and surface errors.
  const [saveError, setSaveError] = useState<string | null>(null)
  const reportErr = (e: unknown) =>
    setSaveError(e instanceof Error ? e.message : String(e))

  // ---- Person ----
  async function handlePersonCreate(p: Person) {
    const { id: _omit, ...data } = p
    setPersonnelData(prev => [...(prev ?? []), p])
    try {
      const saved = await createPerson(data)
      setPersonnelData(prev => prev!.map(x => x.id === p.id ? saved : x))
      setSaveError(null)
      // keep the SWR cache in sync so a re-navigation shows server truth
      void mutate()
    } catch (e) { reportErr(e); setPersonnelData(prev => prev!.filter(x => x.id !== p.id)) }
  }
  async function handlePersonUpdate(p: Person) {
    const prevPerson = personnelData?.find(x => x.id === p.id)
    setPersonnelData(prev => prev!.map(x => x.id === p.id ? p : x))
    setEditingPerson(null)
    try {
      await updatePerson(p.id, p)
      setSaveError(null)
      void mutate()
    } catch (e) { reportErr(e); if (prevPerson) setPersonnelData(prev => prev!.map(x => x.id === p.id ? prevPerson : x)) }
  }
  async function handlePersonDelete(p: Person) {
    const snapshot = personnelData
    setPersonnelData(prev => prev!.filter(x => x.id !== p.id))
    try {
      await deletePerson(p.id)
      setSaveError(null)
      void mutate()
    } catch (e) { reportErr(e); if (snapshot) setPersonnelData(snapshot) }
  }

  // ---- Resource ----
  async function handleResourceCreate(r: Resource) {
    const { id: _omit, ...data } = r
    setResourcesData(prev => [...(prev ?? []), r])
    try {
      const saved = await createResource(data)
      setResourcesData(prev => prev!.map(x => x.id === r.id ? saved : x))
      setSaveError(null)
      void mutate()
    } catch (e) { reportErr(e); setResourcesData(prev => prev!.filter(x => x.id !== r.id)) }
  }
  async function handleResourceUpdate(r: Resource) {
    const prevRes = resourcesData?.find(x => x.id === r.id)
    setResourcesData(prev => prev!.map(x => x.id === r.id ? r : x))
    setEditingResource(null)
    try {
      await updateResource(r.id, r)
      setSaveError(null)
      void mutate()
    } catch (e) { reportErr(e); if (prevRes) setResourcesData(prev => prev!.map(x => x.id === r.id ? prevRes : x)) }
  }
  async function handleResourceDelete(r: Resource) {
    const snapshot = resourcesData
    setResourcesData(prev => prev!.filter(x => x.id !== r.id))
    try {
      await deleteResource(r.id)
      setSaveError(null)
      void mutate()
    } catch (e) { reportErr(e); if (snapshot) setResourcesData(snapshot) }
  }

  // ---- News ----
  async function handleNewsCreate(n: NewsItem) {
    const { id: _omit, ...data } = n
    setNewsData(prev => [n, ...(prev ?? [])])
    try {
      const saved = await createNews(data)
      setNewsData(prev => prev!.map(x => x.id === n.id ? saved : x))
      setSaveError(null)
      void mutate()
    } catch (e) { reportErr(e); setNewsData(prev => prev!.filter(x => x.id !== n.id)) }
  }
  async function handleNewsUpdate(n: NewsItem) {
    const prevNews = newsData?.find(x => x.id === n.id)
    setNewsData(prev => prev!.map(x => x.id === n.id ? n : x))
    setEditingNews(null)
    try {
      await updateNews(n.id, n)
      setSaveError(null)
      void mutate()
    } catch (e) { reportErr(e); if (prevNews) setNewsData(prev => prev!.map(x => x.id === n.id ? prevNews : x)) }
  }
  async function handleNewsDelete(n: NewsItem) {
    const snapshot = newsData
    setNewsData(prev => prev!.filter(x => x.id !== n.id))
    try {
      await deleteNews(n.id)
      setSaveError(null)
      void mutate()
    } catch (e) { reportErr(e); if (snapshot) setNewsData(snapshot) }
  }

  const [editingPerson, setEditingPerson]     = useState<Person | null>(null)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [editingNews, setEditingNews]         = useState<NewsItem | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  async function handleSyncMembers() {
    if (syncing) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await fetch('/api/dingtalk/sync-members', { method: 'POST' })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `同步失败 (${r.status})`)
      setSyncResult(`同步完成：新增 ${data.created} 人，更新 ${data.updated} 人，关联登录 ${data.linked} 人`)
      setSaveError(null)
      void mutate()
    } catch (e) {
      setSyncResult(null)
      reportErr(e)
    } finally {
      setSyncing(false)
    }
  }

  if (user?.role !== 'admin') {
    return (
      <div className="space-y-4 py-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">信息管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理实验室数据</p>
        </div>
        <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center py-16 text-center gap-3">
          <ShieldAlert className="h-8 w-8 text-muted-foreground/50" />
          <div>
            <p className="font-medium">访问受限</p>
            <p className="text-sm text-muted-foreground mt-0.5">您需要管理员权限才能访问此页面</p>
          </div>
        </div>
      </div>
    )
  }

  if (!personnelData || !resourcesData || !newsData) {
    return (
      <div className="space-y-4 py-2">
        <h1 className="text-xl font-semibold tracking-tight">信息管理</h1>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">信息管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理人员、资源和动态信息</p>
        </div>
        {saveError && (
          <span className="text-xs text-destructive">操作失败：{saveError}</span>
        )}
      </div>

      {/* Integration status */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium">集成状态</p>
          <p className="text-xs text-muted-foreground mt-0.5">外部系统对接状态</p>
        </div>
        <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <IntegrationCard name="Authentik SSO" status={providers.authentik ? 'connected' : 'pending'} description="单点登录认证（内网 OIDC）" />
          <IntegrationCard name="钉钉扫码"     status={providers.dingtalk ? 'connected' : 'pending'} description="扫码登录（互联网 OAuth2）" />
          <IntegrationCard name="钉钉考勤"     status="pending"   description="人员考勤数据同步" />
          <IntegrationCard name="数据库"       status="connected" description="SQLite（Prisma）" />
        </div>
      </div>

      {/* Data management tabs */}
      <Tabs defaultValue="personnel">
        <TabsList className="h-9 p-1">
          <TabsTrigger value="personnel" className="text-xs gap-1.5 h-7">
            <Users className="h-3.5 w-3.5" />人员管理
          </TabsTrigger>
          <TabsTrigger value="resources" className="text-xs gap-1.5 h-7">
            <Server className="h-3.5 w-3.5" />资源管理
          </TabsTrigger>
          <TabsTrigger value="news" className="text-xs gap-1.5 h-7">
            <Newspaper className="h-3.5 w-3.5" />动态管理
          </TabsTrigger>
          <TabsTrigger value="floor-layout" className="text-xs gap-1.5 h-7">
            <MapPin className="h-3.5 w-3.5" />工位布局
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personnel" className="mt-3">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">人员管理</p>
                <p className="text-xs text-muted-foreground mt-0.5">管理实验室人员信息</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleSyncMembers} disabled={syncing}>
                  <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
                  {syncing ? '同步中…' : '同步钉钉成员'}
                </Button>
                <PersonDialog onSubmit={handlePersonCreate} />
              </div>
            </div>
            {syncResult && (
              <div className="px-4 py-2 border-b border-border bg-primary/5 text-xs text-primary">{syncResult}</div>
            )}
            <div className="px-4">
              <DataTable
                data={personnelData}
                columns={[
                  { key: 'name',   label: '姓名' },
                  { key: 'role',   label: '角色',  render: v => roleLabels[v as Person['role']] },
                  { key: 'email',  label: '邮箱' },
                  { key: 'status', label: '状态',  render: v => (
                    <Badge variant={v === 'present' ? 'default' : 'secondary'} className="text-[10px] font-normal">
                      {statusLabels[v as keyof typeof statusLabels]}
                    </Badge>
                  )},
                ]}
                onEdit={item => setEditingPerson(item)}
                onDelete={handlePersonDelete}
              />
            </div>
          </div>
          {editingPerson && (
            <PersonDialog
              initialData={editingPerson}
              onSubmit={handlePersonUpdate}
            />
          )}
        </TabsContent>

        <TabsContent value="resources" className="mt-3">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">资源管理</p>
                <p className="text-xs text-muted-foreground mt-0.5">管理实验室资源信息</p>
              </div>
              <ResourceDialog onSubmit={handleResourceCreate} />
            </div>
            <div className="px-4">
              <DataTable
                data={resourcesData}
                columns={[
                  { key: 'name',   label: '名称' },
                  { key: 'type',   label: '类型', render: v => typeLabels[v as keyof typeof typeLabels] },
                  { key: 'status', label: '状态', render: v => (
                    <Badge variant={v === 'available' ? 'default' : 'secondary'} className="text-[10px] font-normal">
                      {v === 'available' ? '可用' : v === 'maintenance' ? '维护中' : '受限'}
                    </Badge>
                  )},
                  { key: 'url', label: 'URL', render: v => v ? (
                    <a href={String(v)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate max-w-[180px] block">
                      {String(v)}
                    </a>
                  ) : <span className="text-muted-foreground">—</span> },
                ]}
                onEdit={item => setEditingResource(item)}
                onDelete={handleResourceDelete}
              />
            </div>
          </div>
          {editingResource && (
            <ResourceDialog
              initialData={editingResource}
              onSubmit={handleResourceUpdate}
            />
          )}
        </TabsContent>

        <TabsContent value="news" className="mt-3">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">动态管理</p>
                <p className="text-xs text-muted-foreground mt-0.5">管理实验室新闻与通知</p>
              </div>
              <NewsDialog onSubmit={handleNewsCreate} />
            </div>
            <div className="px-4">
              <DataTable
                data={newsData}
                columns={[
                  { key: 'title',  label: '标题', render: v => (
                    <span className="truncate max-w-[220px] block text-sm">{String(v)}</span>
                  )},
                  { key: 'type',   label: '类型', render: v => (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {newsLabels[v as keyof typeof newsLabels]}
                    </Badge>
                  )},
                  { key: 'date',   label: '日期' },
                  { key: 'pinned', label: '置顶', render: v => v
                    ? <Badge className="text-[10px] font-normal">置顶</Badge>
                    : <span className="text-muted-foreground">—</span>
                  },
                ]}
                onEdit={item => setEditingNews(item)}
                onDelete={handleNewsDelete}
              />
            </div>
          </div>
          {editingNews && (
            <NewsDialog
              initialData={editingNews}
              onSubmit={handleNewsUpdate}
            />
          )}
        </TabsContent>

        <TabsContent value="floor-layout" className="mt-3">
          <div className="rounded-lg border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium">工位布局管理</p>
              <p className="text-xs text-muted-foreground mt-0.5">配置楼层、区域和工位布局</p>
            </div>
            <div className="p-4">
              <p className="text-sm text-muted-foreground mb-3">
                使用专用编辑器配置工位布局
              </p>
              <Button asChild size="sm" className="h-8 text-xs gap-1.5">
                <a href="/dashboard/admin/floor-layout">打开工位布局编辑器</a>
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* API docs */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium">API 接口</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            通过以下接口进行数据维护，支持后续对接外部系统
          </p>
        </div>
        <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <ApiCard method="GET"   endpoint="/api/personnel"      description="获取人员列表（分页/筛选）" />
          <ApiCard method="POST"  endpoint="/api/personnel"      description="添加新人员（单条）" />
          <ApiCard method="PATCH" endpoint="/api/personnel/:id"  description="更新单个人员" />
          <ApiCard method="GET"   endpoint="/api/resources"      description="获取资源列表（分页/筛选）" />
          <ApiCard method="POST"  endpoint="/api/resources"      description="添加新资源（单条）" />
          <ApiCard method="PATCH" endpoint="/api/resources/:id"  description="更新单个资源" />
          <ApiCard method="GET"   endpoint="/api/news"           description="获取动态列表（分页/筛选）" />
          <ApiCard method="POST"  endpoint="/api/news"           description="发布新动态（单条）" />
          <ApiCard method="PATCH" endpoint="/api/news/:id"       description="更新单条动态" />
        </div>
      </div>
    </div>
  )
}
