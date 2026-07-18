'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { useApiKeys, createApiKey, updateApiKey, revokeApiKey } from '@/lib/api'
import { Key, Plus, Copy, Check, Trash2, Pencil, RotateCcw } from 'lucide-react'
import { useSWRConfig } from 'swr'

// Mirrors lib/rate-limit.ts RATE_LIMIT_DEFAULT. Duplicated here (not imported)
// because lib/rate-limit pulls lib/db (Prisma) into the bundle — this is a
// 'use client' component. Keep in sync.
const RATE_LIMIT_DEFAULT = 60

const ALL_SCOPES = [
  { value: 'sync:members', label: '同步成员' },
  { value: 'sync:attendance', label: '同步考勤' },
  { value: 'news:publish', label: '发布动态' },
  { value: 'news:read', label: '读取动态' },
  { value: 'resource:read', label: '读取资源' },
]

export function ApiKeysPanel() {
  const { data: keysResp, mutate } = useApiKeys()
  const keys = keysResp?.data ?? []
  const { mutate: mutateGlobal } = useSWRConfig()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [rateLimit, setRateLimit] = useState('') // '' = default
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  // Edit dialog state
  const [editing, setEditing] = useState<{ id: string; name: string; scopes: string[]; rateLimit: string } | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const refresh = () => { void mutate(); void mutateGlobal('/api/api-keys') }

  const handleCreate = async () => {
    setCreating(true)
    setError('')
    try {
      const limit = rateLimit.trim() === '' ? null : parseInt(rateLimit, 10)
      if (rateLimit.trim() !== '' && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
        setError('每分钟限额必须是正整数')
        setCreating(false)
        return
      }
      const res = await createApiKey(name, scopes, limit)
      setNewKey(res.key)
      setCopied(false)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
    } finally {
      setCreating(false)
    }
  }

  const handleEditSave = async () => {
    if (!editing) return
    setEditSaving(true)
    setError('')
    try {
      const limit = editing.rateLimit.trim() === '' ? null : parseInt(editing.rateLimit, 10)
      if (editing.rateLimit.trim() !== '' && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
        setError('每分钟限额必须是正整数')
        setEditSaving(false)
        return
      }
      await updateApiKey(editing.id, { name: editing.name, scopes: editing.scopes, rateLimitPerMin: limit })
      setEditing(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
    } finally {
      setEditSaving(false)
    }
  }

  const handleResetCounter = async (id: string) => {
    if (!confirm('重置此密钥的计数器？（清零当前窗口已用次数）')) return
    try {
      await updateApiKey(id, { resetCounter: true })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('确定吊销此密钥？吊销后无法恢复。')) return
    try {
      await revokeApiKey(id)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
    }
  }

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey)
      setCopied(true)
    }
  }

  const closeDialog = () => {
    setOpen(false)
    setName('')
    setScopes([])
    setRateLimit('')
    setNewKey(null)
    setError('')
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-sm font-medium">API 密钥</p>
          <p className="text-xs text-muted-foreground mt-0.5">用于外部系统通过 API 触发同步或发布。密钥仅在创建时显示一次。</p>
        </div>
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) closeDialog() }}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" />新建密钥</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建 API 密钥</DialogTitle>
              <DialogDescription>选择此密钥可执行的操作范围。</DialogDescription>
            </DialogHeader>
            {newKey ? (
              <div className="space-y-3 py-2">
                <div className="rounded-md border border-[var(--status-present)]/30 bg-[var(--status-present)]/5 p-3 space-y-2">
                  <p className="text-xs font-medium text-[var(--status-present)]">密钥已生成（仅此一次可见，请立即复制）</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded truncate">{newKey}</code>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={copyKey}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={closeDialog}>完成</Button>
              </div>
            ) : (
              <>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">名称 *</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：定时同步脚本" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">权限范围 *</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_SCOPES.map(s => {
                        const active = scopes.includes(s.value)
                        return (
                          <Button
                            key={s.value}
                            type="button"
                            size="sm"
                            variant={active ? 'default' : 'outline'}
                            className="h-7 text-xs"
                            onClick={() => setScopes(active ? scopes.filter(x => x !== s.value) : [...scopes, s.value])}
                          >
                            {s.label}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">每分钟限额（留空 = 默认 {RATE_LIMIT_DEFAULT}）</Label>
                    <Input
                      value={rateLimit}
                      onChange={e => setRateLimit(e.target.value)}
                      placeholder={`${RATE_LIMIT_DEFAULT}`}
                      className="h-9"
                      inputMode="numeric"
                    />
                  </div>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={closeDialog}>取消</Button>
                  <Button size="sm" onClick={handleCreate} disabled={creating || !name || scopes.length === 0}>
                    {creating ? '生成中…' : '生成密钥'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <div className="p-2">
        {keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Key className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">暂无密钥，点击"新建密钥"创建</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">名称</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">前缀</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">权限</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">限额/分钟</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">最近使用</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map(k => (
                  <tr key={k.id} className="hover:bg-muted/30">
                    <td className="py-2 px-3 text-sm font-medium">{k.name}</td>
                    <td className="py-2 px-3"><code className="text-xs font-mono text-muted-foreground">{k.prefix}…</code></td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map(s => (
                          <Badge key={s} variant="secondary" className="text-[10px] h-4 px-1 font-normal">
                            {ALL_SCOPES.find(x => x.value === s)?.label ?? s}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-xs">
                      <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
                        {k.rateLimitPerMin ?? RATE_LIMIT_DEFAULT}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('zh-CN') : '—'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title="编辑"
                          onClick={() => setEditing({ id: k.id, name: k.name, scopes: k.scopes, rateLimit: k.rateLimitPerMin == null ? '' : String(k.rateLimitPerMin) })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title="重置计数器"
                          onClick={() => handleResetCounter(k.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRevoke(k.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={v => { if (!v) { setEditing(null); setError('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑密钥</DialogTitle>
            <DialogDescription>修改名称、权限范围或每分钟限额。</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">名称</Label>
                <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">权限范围</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_SCOPES.map(s => {
                    const active = editing.scopes.includes(s.value)
                    return (
                      <Button
                        key={s.value} type="button" size="sm"
                        variant={active ? 'default' : 'outline'} className="h-7 text-xs"
                        onClick={() => setEditing({ ...editing, scopes: active ? editing.scopes.filter(x => x !== s.value) : [...editing.scopes, s.value] })}
                      >
                        {s.label}
                      </Button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">每分钟限额（留空 = 默认 {RATE_LIMIT_DEFAULT}）</Label>
                <Input
                  value={editing.rateLimit}
                  onChange={e => setEditing({ ...editing, rateLimit: e.target.value })}
                  placeholder={`${RATE_LIMIT_DEFAULT}`}
                  className="h-9"
                  inputMode="numeric"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => { setEditing(null); setError('') }}>取消</Button>
                <Button size="sm" onClick={handleEditSave} disabled={editSaving || !editing.name || editing.scopes.length === 0}>
                  {editSaving ? '保存中…' : '保存'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
