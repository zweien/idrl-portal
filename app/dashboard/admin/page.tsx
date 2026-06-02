'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { mockPersonnel, mockResources, mockNews } from '@/lib/mock-data'
import type { Person, Resource, NewsItem } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { PersonDialog } from '@/components/admin/person-dialog'
import { ResourceDialog } from '@/components/admin/resource-dialog'
import { NewsDialog } from '@/components/admin/news-dialog'
import {
  Users, Server, Newspaper, Trash2,
  Database, RefreshCw, AlertTriangle, CheckCircle, Info,
  ShieldAlert, MapPin,
} from 'lucide-react'

/* ── Labels ─────────────────────────────────────── */
const roleLabels: Record<Person['role'], string> = {
  professor: '教授', postdoc: '博士后', phd: '博士生',
  master: '硕士生', undergraduate: '本科生', staff: '行政人员',
}
const statusLabels = { online: '在位', offline: '离开', busy: '忙碌', leave: '请假' }
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
    connected: { icon: CheckCircle, color: 'text-[var(--status-online)]', label: '已连接' },
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
  const [personnelData, setPersonnelData] = useState(mockPersonnel)
  const [resourcesData, setResourcesData] = useState(mockResources)
  const [newsData, setNewsData]           = useState(mockNews)

  const [editingPerson, setEditingPerson]     = useState<Person | null>(null)
  const [editingResource, setEditingResource] = useState<Resource | null>(null)
  const [editingNews, setEditingNews]         = useState<NewsItem | null>(null)

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

  return (
    <div className="space-y-4 py-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">信息管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理人员、资源和动态信息</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-normal gap-1">
            <Database className="h-3 w-3" />本地数据
          </Badge>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />同步数据
          </Button>
        </div>
      </div>

      {/* Integration status */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium">集成状态</p>
          <p className="text-xs text-muted-foreground mt-0.5">外部系统对接状态</p>
        </div>
        <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <IntegrationCard name="Authentik SSO" status="pending" description="单点登录认证" />
          <IntegrationCard name="钉钉扫码"     status="pending" description="扫码登录与考勤" />
          <IntegrationCard name="钉钉考勤"     status="pending" description="人员考勤数据同步" />
          <IntegrationCard name="数据库"       status="mock"    description="SQLite / PostgreSQL" />
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
              <PersonDialog onSubmit={p => setPersonnelData(prev => [...prev, p])} />
            </div>
            <div className="px-4">
              <DataTable
                data={personnelData}
                columns={[
                  { key: 'name',   label: '姓名' },
                  { key: 'role',   label: '角色',  render: v => roleLabels[v as Person['role']] },
                  { key: 'email',  label: '邮箱' },
                  { key: 'status', label: '状态',  render: v => (
                    <Badge variant={v === 'online' ? 'default' : 'secondary'} className="text-[10px] font-normal">
                      {statusLabels[v as keyof typeof statusLabels]}
                    </Badge>
                  )},
                ]}
                onEdit={item => setEditingPerson(item)}
                onDelete={item => setPersonnelData(prev => prev.filter(p => p.id !== item.id))}
              />
            </div>
          </div>
          {editingPerson && (
            <PersonDialog
              initialData={editingPerson}
              onSubmit={updated => { setPersonnelData(prev => prev.map(p => p.id === updated.id ? updated : p)); setEditingPerson(null) }}
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
              <ResourceDialog onSubmit={r => setResourcesData(prev => [...prev, r])} />
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
                onDelete={item => setResourcesData(prev => prev.filter(r => r.id !== item.id))}
              />
            </div>
          </div>
          {editingResource && (
            <ResourceDialog
              initialData={editingResource}
              onSubmit={updated => { setResourcesData(prev => prev.map(r => r.id === updated.id ? updated : r)); setEditingResource(null) }}
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
              <NewsDialog onSubmit={n => setNewsData(prev => [n, ...prev])} />
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
                onDelete={item => setNewsData(prev => prev.filter(n => n.id !== item.id))}
              />
            </div>
          </div>
          {editingNews && (
            <NewsDialog
              initialData={editingNews}
              onSubmit={updated => { setNewsData(prev => prev.map(n => n.id === updated.id ? updated : n)); setEditingNews(null) }}
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
          <ApiCard method="GET"  endpoint="/api/personnel" description="获取人员列表" />
          <ApiCard method="POST" endpoint="/api/personnel" description="添加新人员" />
          <ApiCard method="GET"  endpoint="/api/resources"  description="获取资源列表" />
          <ApiCard method="POST" endpoint="/api/resources"  description="添加新资源" />
          <ApiCard method="GET"  endpoint="/api/news"       description="获取动态列表" />
          <ApiCard method="POST" endpoint="/api/news"       description="发布新动态" />
        </div>
      </div>
    </div>
  )
}
