'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSettings, patchSettings } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Admin control for the configured trip work-hours
 * (Setting `attendance.tripWorkHours`, default 8). Trip days are credited
 * this many hours in the export summary regardless of punches.
 */
export function TripHoursSetting() {
  const { data, mutate } = useSettings()
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const current = data?.data?.['attendance.tripWorkHours'] ?? '8'

  useEffect(() => {
    setValue(current)
  }, [current])

  async function save() {
    const n = parseFloat(value)
    if (!Number.isFinite(n) || n < 0) {
      setMsg('请输入非负数字（小时）')
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      await patchSettings({ 'attendance.tripWorkHours': String(n) })
      setMsg('已保存')
      await mutate()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const dirty = value !== current

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">出差固定工时</CardTitle>
        <p className="text-xs text-muted-foreground">
          出差天按此固定值计入工时（忽略实际打卡）。设为 0 表示出差不计工时。导出汇总时生效。
        </p>
      </CardHeader>
      <CardContent className="pt-0 flex items-center gap-2">
        <Input
          type="number"
          min="0"
          step="0.5"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="h-8 w-28 text-sm"
        />
        <span className="text-sm text-muted-foreground">小时/天</span>
        <Button size="sm" className="h-8 ml-auto" onClick={save} disabled={!dirty || saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
        {msg && (
          <span className={cn('text-xs', msg === '已保存' ? 'text-[var(--status-present)]' : 'text-destructive')}>
            {msg}
          </span>
        )}
      </CardContent>
    </Card>
  )
}
