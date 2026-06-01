'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, ShieldCheck, QrCode, AlertCircle } from 'lucide-react'

export function LoginForm() {
  const [username, setUsername]     = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [ssoMessage, setSsoMessage] = useState('')
  const { login, loginWithSSO, isLoading } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username || !password) { setError('请输入用户名和密码'); return }
    const ok = await login(username, password)
    if (ok) {
      window.location.href = '/dashboard'
    } else {
      setError('用户名或密码错误')
    }
  }

  const handleSSOLogin = async (provider: 'authentik' | 'dingtalk') => {
    setSsoMessage('')
    const ok = await loginWithSSO(provider)
    if (!ok) {
      setSsoMessage(
        provider === 'authentik'
          ? 'Authentik SSO 尚未配置，请联系管理员'
          : '钉钉扫码登录尚未配置，请联系管理员'
      )
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Wordmark */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <span className="text-[11px] font-bold text-primary-foreground leading-none">ID</span>
          </div>
          <span className="text-base font-semibold tracking-tight">IDRL Portal</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">登录</h1>
        <p className="text-sm text-muted-foreground">
          智能数据研究实验室信息聚合门户
        </p>
      </div>

      {/* SSO buttons */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full h-9 text-sm justify-start gap-2.5"
          onClick={() => handleSSOLogin('authentik')}
          disabled={isLoading}
        >
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          使用 Authentik SSO 登录
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full h-9 text-sm justify-start gap-2.5"
          onClick={() => handleSSOLogin('dingtalk')}
          disabled={isLoading}
        >
          <QrCode className="h-4 w-4 text-primary shrink-0" />
          钉钉扫码登录
        </Button>
      </div>

      {ssoMessage && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {ssoMessage}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">或</span>
        <Separator className="flex-1" />
      </div>

      {/* Credentials form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="username" className="text-xs font-medium">
            用户名
          </Label>
          <Input
            id="username"
            type="text"
            placeholder="请输入用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-9 text-sm"
            disabled={isLoading}
            autoComplete="username"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium">
            密码
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 text-sm"
            disabled={isLoading}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-9 text-sm"
          disabled={isLoading}
        >
          {isLoading ? (
            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />登录中...</>
          ) : '登录'}
        </Button>
      </form>

      <p className="text-xs text-center text-muted-foreground">
        演示账号：<code className="font-mono">admin</code> / <code className="font-mono">admin</code>
      </p>
    </div>
  )
}
