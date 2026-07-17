'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSettings, useSyncLogs, patchSettings } from '@/lib/api'
import { CRON_DEFAULTS } from '@/lib/cron-presets'
import { useSWRConfig } from 'swr'
import { RefreshCw, Clock, CheckCircle, XCircle } from 'lucide-react'

const CRON_PRESETS = [
  { value: '*/15 * * * *', label: '每 15 分钟' },
  { value: '*/30 * * * *', label: '每 30 分钟' },
  { value: '0 * * * *', label: '每小时' },
  { value: '0 8-20 * * 1-5', label: '工作日 8-20 点每小时' },
  { value: '0 6 * * *', label: '每天 6:00' },
  { value: '0 0 * * *', label: '每天凌晨' },
  { value: '0 6 * * 1', label: '每周一' },
  { value: '*/5 * * * *', label: '每 5 分钟' },
]

const JOBS = [
  { job: 'sync-members' as const, cronKey: 'cron.members', enableKey: 'cron.enabled.members', label: '成员同步', presets: ['0 6 * * *', '0 0 * * *', '0 6 * * 1', '*/5 * * * *'] },
  { job: 'sync-attendance' as const, cronKey: 'cron.attendance', enableKey: 'cron.enabled.attendance', label: '考勤同步', presets: ['*/15 * * * *', '*/30 * * * *', '0 * * * *', '0 8-20 * * 1-5'] },
  { job: 'publish-news' as const, cronKey: 'cron.publish', enableKey: 'cron.enabled.publish', label: '定时发布', presets: ['*/5 * * * *', '*/15 * * * *'] },
]

export function SchedulingPanel() {
  const { data: settingsResp, mutate } = useSettings()
  const settings = settingsResp?.data ?? {}
  const { data: logsResp } = useSyncLogs(undefined, 20)
  const logs = logsResp?.data ?? []
  const { mutate: mutateGlobal } = useSWRConfig()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    if (settingsResp) {
      setDraft(s => {
        const next: Record<string, string> = {}
        for (const j of JOBS) {
          // Show the scheduler's actual default when no Setting row exists, so
          // the panel reflects real behavior on a fresh DB instead of blanks.
          next[j.cronKey] = settings[j.cronKey] ?? CRON_DEFAULTS[j.job]
          next[j.enableKey] = settings[j.enableKey] ?? ''
        }
        return { ...next, ...s }
      })
    }
  }, [settingsResp, settings])

  const handleSave = async () => {
    setSaving(true)
    setSavedMsg('')
    try {
      // only send keys that changed from current
      const changed: Record<string, string> = {}
      for (const j of JOBS) {
        const curCron = settings[j.cronKey] ?? CRON_DEFAULTS[j.job]
        if (draft[j.cronKey] !== curCron) changed[j.cronKey] = draft[j.cronKey]
        if (draft[j.enableKey] !== (settings[j.enableKey] ?? '')) changed[j.enableKey] = draft[j.enableKey]
      }
      if (Object.keys(changed).length === 0) {
        setSavedMsg('无变更')
      } else {
        await patchSettings(changed)
        await mutate()
        setSavedMsg(`已保存 ${Object.keys(changed).length} 项`)
      }
    } catch (e) {
      setSavedMsg(`保存失败：${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setSaving(false)
      setTimeout(() => setSavedMsg(''), 3000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">调度设置</p>
          <p className="text-xs text-muted-foreground mt-0.5">配置同步与定时发布的执行周期。修改后无需重启，约 1 分钟内生效。cron 表达式按 UTC 时间解释（如"工作日 8-20 点"为 UTC 08-20）。</p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存设置'}
        </Button>
      </div>
      {savedMsg && <p className="text-xs text-primary">{savedMsg}</p>}

      <div className="space-y-3">
        {JOBS.map(j => {
          const expr = draft[j.cronKey] ?? ''
          const presetMatch = CRON_PRESETS.find(p => p.value === expr)
          return (
            <div key={j.job} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{j.label}</span>
                  <Switch
                    checked={draft[j.enableKey] !== 'false'}
                    onCheckedChange={v => setDraft({ ...draft, [j.enableKey]: v ? 'true' : 'false' })}
                  />
                  <span className="text-xs text-muted-foreground">{draft[j.enableKey] === 'false' ? '已停用' : '已启用'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">预设</Label>
                  <Select value={presetMatch?.value ?? '__custom__'} onValueChange={v => setDraft({ ...draft, [j.cronKey]: v === '__custom__' ? '' : v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="自定义" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__custom__">自定义（下方输入）</SelectItem>
                      {j.presets.map(pv => {
                        const p = CRON_PRESETS.find(c => c.value === pv)!
                        return <SelectItem key={pv} value={pv}>{p.label}</SelectItem>
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">cron 表达式</Label>
                  <Input
                    value={expr}
                    onChange={e => setDraft({ ...draft, [j.cronKey]: e.target.value })}
                    placeholder={j.cronKey === 'cron.members' ? '0 6 * * *' : j.cronKey === 'cron.publish' ? '*/5 * * * *' : '0 * * * *'}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent sync logs */}
      <div className="rounded-md border border-border">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">最近执行记录</span>
        </div>
        <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">暂无记录</p>
          ) : logs.map(l => (
            <div key={l.id} className="flex items-center gap-2 text-[11px] py-1 px-1.5">
              {l.status === 'success'
                ? <CheckCircle className="h-3 w-3 text-[var(--status-present)] shrink-0" />
                : <XCircle className="h-3 w-3 text-[var(--status-absent)] shrink-0" />}
              <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">{l.job}</Badge>
              <span className="text-muted-foreground">{l.source}</span>
              <span className="text-muted-foreground ml-auto">{new Date(l.createdAt).toLocaleString('zh-CN')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
