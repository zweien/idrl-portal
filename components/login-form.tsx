'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, ShieldCheck, QrCode, AlertCircle } from 'lucide-react'

export function LoginForm() {
  const isDev = process.env.NODE_ENV === 'development'
  const [username, setUsername]     = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [ssoMessage, setSsoMessage] = useState('')
  // 登录提交中的本地状态。不要用 useAuth 的 isLoading：那是会话 hydration
  // 状态，首屏为 true，会让按钮在未提交时就显示「登录中…」。
  const [submitting, setSubmitting] = useState(false)
  const { devLogin } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username || !password) { setError('请输入用户名和密码'); return }
    setSubmitting(true)
    try {
      const ok = await devLogin(username)
      if (!ok) {
        setError('登录失败')
        return
      }
      window.location.href = '/dashboard'
    } finally {
      setSubmitting(false)
    }
  }

  const handleSSOLogin = async (provider: 'authentik' | 'dingtalk') => {
    if (submitting) return
    setSsoMessage('')
    setSubmitting(true)
    if (provider === 'authentik') {
      // Server-side OIDC redirect: full-page navigation to Authentik authorize.
      window.location.href = '/api/auth/login/authentik'
      return
    }
    // Server-side OAuth2 redirect: full-page navigation to DingTalk scan-code authorize.
    window.location.href = '/api/auth/login/dingtalk'
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Wordmark */}
      <div className="space-y-1">
        <div className="mb-4">
          <Brand variant="bilingual" width={216} priority />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">登录</h1>
        <p className="text-sm text-muted-foreground">
          智能设计与鲁棒学习 · 信息聚合门户
        </p>
      </div>

      {/* SSO buttons */}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full h-9 text-sm justify-start gap-2.5"
          onClick={() => handleSSOLogin('authentik')}
          disabled={submitting}
        >
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          使用 Authentik SSO 登录
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full h-9 text-sm justify-start gap-2.5"
          onClick={() => handleSSOLogin('dingtalk')}
          disabled={submitting}
        >
          <QrCode className="h-4 w-4 text-primary shrink-0" />
          钉钉扫码登录
        </Button>
      </div>

      {ssoMessage && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-[rgb(var(--muted-rgb)/0.5)] px-3 py-2.5 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {ssoMessage}
        </div>
      )}

      {isDev && (
        <>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">或</span>
            <Separator className="flex-1" />
          </div>

          {/* Dev-only credentials form. Production shows SSO buttons only. */}
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
                disabled={submitting}
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
                disabled={submitting}
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
              disabled={submitting}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />登录中...</>
              ) : '登录'}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground">
            演示账号：<code className="font-mono">admin</code> / <code className="font-mono">admin</code>
          </p>
        </>
      )}
    </div>
  )
}
