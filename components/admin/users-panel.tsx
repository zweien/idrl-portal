'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PersonPicker } from '@/components/admin/person-picker'
import { useUsers, usePersonnel, updateUser } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useSWRConfig } from 'swr'
import { ShieldCheck, ShieldOff, Ban, RotateCcw } from 'lucide-react'

const providerLabels: Record<string, string> = {
  authentik: 'Authentik',
  dingtalk: '钉钉',
  local: '本地',
}

export function UsersPanel() {
  const { data: usersResp, mutate } = useUsers()
  const { data: personnelResp } = usePersonnel({ pageSize: 1000 })
  const users = usersResp?.data ?? []
  const personnel = personnelResp?.data?.items ?? []
  const { user: currentUser } = useAuth()
  const { mutate: mutateGlobal } = useSWRConfig()
  const [error, setError] = useState('')

  const refresh = () => { void mutate(); void mutateGlobal('/api/users') }

  const handleRoleChange = async (id: string, role: 'admin' | 'member') => {
    setError('')
    try {
      await updateUser(id, { role })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
    }
  }

  const handlePersonChange = async (id: string, personId: string | null) => {
    setError('')
    try {
      await updateUser(id, { personId })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
    }
  }

  const handleToggleDisable = async (id: string, currentlyDisabled: boolean) => {
    setError('')
    const verb = currentlyDisabled ? '解封' : '封禁'
    if (!confirm(`确定${verb}此账号？`)) return
    try {
      await updateUser(id, { disabled: !currentlyDisabled })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-medium">用户管理</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          管理登录账号的角色（管理员/成员）、关联人员与封禁状态。为防止锁死，不能修改自己的角色或封禁自己。
        </p>
      </div>
      {error && <div className="px-4 py-2 border-b border-border bg-destructive/5 text-xs text-destructive">{error}</div>}
      <div className="p-2">
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">暂无用户</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">账号</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">标识</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">角色</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">关联人员</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">状态</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(u => {
                  const isSelf = currentUser?.id === u.id
                  const disabled = !!u.disabledAt
                  return (
                    <tr key={u.id} className={isSelf ? 'bg-primary/5' : 'hover:bg-muted/30'}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
                            {providerLabels[u.provider] ?? u.provider}
                          </Badge>
                          {isSelf && <span className="text-[10px] text-primary">你</span>}
                        </div>
                      </td>
                      <td className="py-2 px-3"><code className="text-xs font-mono text-muted-foreground">{u.externalId}</code></td>
                      <td className="py-2 px-3">
                        <Select
                          value={u.role}
                          onValueChange={(v: string) => handleRoleChange(u.id, v as 'admin' | 'member')}
                          disabled={isSelf}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">管理员</SelectItem>
                            <SelectItem value="member">成员</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-3">
                        <PersonPicker
                          value={u.personId ?? null}
                          personnel={personnel}
                          onChange={pid => handlePersonChange(u.id, pid)}
                          placeholder="未关联"
                          className="w-36"
                        />
                      </td>
                      <td className="py-2 px-3">
                        {disabled ? (
                          <Badge className="text-[10px] h-4 px-1 font-normal bg-[var(--status-absent)]/15 text-[var(--status-absent)]">已封禁</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1 font-normal">正常</Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={isSelf}
                          onClick={() => handleToggleDisable(u.id, disabled)}
                          title={isSelf ? '不能封禁自己' : ''}
                        >
                          {disabled
                            ? <><RotateCcw className="h-3.5 w-3.5" />解封</>
                            : <><Ban className="h-3.5 w-3.5" />封禁</>}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
