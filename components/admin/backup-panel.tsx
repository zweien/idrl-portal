'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { patchSettings } from '@/lib/api'
import { useSWRConfig } from 'swr'
import {
  Database, Download, Upload, Trash2, RotateCcw, FileJson, Plus, RefreshCw,
} from 'lucide-react'

interface BackupInfo {
  filename: string
  sizeKb: number
  createdAt: string
  trigger: 'auto' | 'manual' | 'pre-restore'
}

const triggerLabels: Record<BackupInfo['trigger'], string> = {
  auto: '自动',
  manual: '手动',
  'pre-restore': '恢复前',
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts)
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
  return data as T
}

export function BackupPanel() {
  const { mutate } = useSWRConfig()
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [keep, setKeep] = useState('7')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    const data = await api<{ data: { backups: BackupInfo[]; keep: number } }>('/api/backup')
    setBackups(data.data.backups)
    setKeep(String(data.data.keep))
    void mutate('/api/sync-logs')
  }

  // Initial load.
  useEffect(() => { void refresh() }, [])

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleCreate = async () => {
    setBusy('create')
    try {
      const d = await api<{ data: BackupInfo }>('/api/backup', { method: 'POST' })
      flash('ok', `已创建备份 ${d.data.filename}（${d.data.sizeKb} KB）`)
      await refresh()
    } catch (e) {
      flash('err', e instanceof Error ? e.message : '备份失败')
    } finally {
      setBusy('')
    }
  }

  const handleDelete = async (filename: string) => {
    if (!confirm(`删除备份 ${filename}？`)) return
    setBusy('delete-' + filename)
    try {
      await api(`/api/backup?filename=${encodeURIComponent(filename)}`, { method: 'DELETE' })
      flash('ok', `已删除 ${filename}`)
      await refresh()
    } catch (e) {
      flash('err', e instanceof Error ? e.message : '删除失败')
    } finally {
      setBusy('')
    }
  }

  const handleRestore = async () => {
    if (!restoreTarget) return
    setBusy('restore-' + restoreTarget)
    try {
      const d = await api<{ data: { restored: string; preRestoreSnapshot: string } }>(
        '/api/backup/restore',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: restoreTarget }) },
      )
      flash('ok', `已从 ${d.data.restored} 恢复（恢复前快照 ${d.data.preRestoreSnapshot}）。请刷新页面查看最新数据。`)
      await refresh()
    } catch (e) {
      flash('err', e instanceof Error ? e.message : '恢复失败')
    } finally {
      setRestoreTarget(null)
      setBusy('')
    }
  }

  const handleUpload = async (file: File) => {
    setBusy('upload')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const d = await api<{ data: { preRestoreSnapshot: string } }>('/api/backup/upload', {
        method: 'POST',
        body: fd,
      })
      flash('ok', `已从上传文件恢复（恢复前快照 ${d.data.preRestoreSnapshot}）。请刷新页面。`)
      await refresh()
    } catch (e) {
      flash('err', e instanceof Error ? e.message : '上传恢复失败')
    } finally {
      setBusy('')
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handleSaveKeep = async () => {
    const n = parseInt(keep, 10)
    if (!Number.isInteger(n) || n <= 0) {
      flash('err', '保留份数必须是正整数')
      return
    }
    setBusy('keep')
    try {
      await patchSettings({ 'backup.keep': String(n) })
      flash('ok', `保留份数已设为 ${n}`)
    } catch (e) {
      flash('err', e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">备份与恢复</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              手动备份当前数据库、从备份恢复、上传备份文件恢复、或导出业务数据为 JSON。
            </p>
          </div>
        </div>
        {msg && (
          <div className={
            msg.kind === 'ok'
              ? 'rounded-md border border-[var(--status-present)]/30 bg-[var(--status-present)]/5 px-3 py-2 text-xs text-[var(--status-present)]'
              : 'rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive'
          }>
            {msg.text}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleCreate} disabled={!!busy}>
            <Plus className="h-3.5 w-3.5" />立即备份
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" asChild>
            <a href="/api/export" target="_blank" rel="noopener noreferrer">
              <FileJson className="h-3.5 w-3.5" />导出 JSON
            </a>
          </Button>
          <Button
            size="sm" variant="outline" className="h-8 text-xs gap-1.5"
            onClick={() => fileInput.current?.click()}
            disabled={!!busy}
          >
            <Upload className="h-3.5 w-3.5" />上传恢复
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".sqlite,.db,application/octet-stream"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
            }}
          />
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={refresh} disabled={!!busy}>
            <RefreshCw className={cn('h-3.5 w-3.5', busy === 'create' && 'animate-spin')} />刷新
          </Button>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground">保留份数</span>
          <Input
            value={keep}
            onChange={e => setKeep(e.target.value)}
            className="h-7 w-20 text-xs"
            inputMode="numeric"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSaveKeep} disabled={busy === 'keep'}>
            保存
          </Button>
          <span className="text-[10px] text-muted-foreground">超出会自动删除最旧的（自动备份时生效）</span>
        </div>
      </div>

      {/* Backup list */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium">备份列表</p>
        </div>
        <div className="p-2">
          {backups === null ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Database className="h-8 w-8 text-muted-foreground/40 mb-3 animate-pulse" />
              <p className="text-sm text-muted-foreground">加载中…</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Database className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">暂无备份，点击"立即备份"创建</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">文件名</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">时间</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">来源</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">大小</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {backups.map(b => (
                    <tr key={b.filename} className="hover:bg-muted/30">
                      <td className="py-2 px-3"><code className="text-xs font-mono text-muted-foreground">{b.filename}</code></td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString('zh-CN')}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
                          {triggerLabels[b.trigger]}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{b.sizeKb} KB</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <a
                            href={`/api/backup/download?filename=${encodeURIComponent(b.filename)}`}
                            className="inline-flex items-center justify-center h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="下载"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title="恢复"
                            onClick={() => setRestoreTarget(b.filename)}
                            disabled={!!busy}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            title="删除"
                            onClick={() => handleDelete(b.filename)}
                            disabled={busy === 'delete-' + b.filename}
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
      </div>

      {/* Restore confirmation */}
      <AlertDialog open={!!restoreTarget} onOpenChange={v => { if (!v) setRestoreTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认恢复备份？</AlertDialogTitle>
            <AlertDialogDescription>
              这会用 <code className="font-mono text-xs">{restoreTarget}</code> 的内容覆盖当前所有数据。
              系统会先自动备份当前状态（恢复前快照），以便回滚。恢复后建议刷新页面。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={!!busy && busy.startsWith('restore')}>
              {busy.startsWith('restore') ? '恢复中…' : '确认恢复'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// local cn to avoid an extra import (small file)
function cn(...xs: (string | false | undefined)[]) {
  return xs.filter(Boolean).join(' ')
}
