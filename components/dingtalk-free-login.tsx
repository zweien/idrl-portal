'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

/**
 * 钉钉客户端内免登（工作台打开时自动登录）。
 *
 * 触发条件（两者都满足才会运行，否则渲染 null、走正常登录表单）：
 *   1. 页面 URL 带 corpId —— 开发者后台把应用首页地址配成
 *      `https://host/?corpid=$CORPID$`，钉钉工作台打开时自动替换（仅在
 *      工作台入口生效）；`/?corpid=` 由 app/page.tsx 透传到 /login。
 *   2. UA 含 DingTalk —— 浏览器里免登组件不可用（官方：端外无法调用免登）。
 *
 * 链路：dd.ready → dd.runtime.permission.requestAuthCode（免鉴权 JSAPI，
 * 无需 dd.config 签名）→ POST /api/auth/dingtalk/exchange-authcode 建会话 →
 * 跳 /dashboard。失败时展示可读错误并保留下方扫码按钮兜底。
 *
 * 参考：docs/research/2026-10-16-dingtalk-client-free-login.md
 */

/** 本组件只用到的最小 JSAPI 形状（不耦合 dingtalk-jsapi 的完整类型）。 */
interface DingTalkJsApi {
  ready(cb: () => void): void
  runtime: {
    permission: {
      requestAuthCode(opts: {
        corpId: string
        clientId?: string
        onSuccess: (result: { code: string }) => void
        onFail: (err: unknown) => void
      }): void
    }
  }
}

export function DingTalkFreeLogin() {
  const [status, setStatus] = useState<'idle' | 'running' | 'failed'>('idle')
  const [message, setMessage] = useState('')
  // StrictMode dev 下 effect 会跑两次：免登授权码一次性，只能发起一轮，
  // 用 ref 保证整个组件生命周期只尝试一次。
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const params = new URLSearchParams(window.location.search)
    // 官方文档两种大小写都出现过（?corpid= 与 ?corpId=），都接受。
    const corpId = params.get('corpid') ?? params.get('corpId')
    if (!corpId || !/DingTalk/i.test(navigator.userAgent)) return

    // 是否处于钉钉容器只能在客户端挂载后检测（SSR 无法读 UA/URL），
    // 这里的同步 setState 是刻意的环境切换，不是可推迟的状态派生。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('running')

    const fail = (msg: string) => {
      setStatus('failed')
      setMessage(msg)
    }

    const exchange = async (authCode: string) => {
      try {
        const res = await fetch('/api/auth/dingtalk/exchange-authcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authCode }),
        })
        if (res.ok) {
          window.location.replace('/dashboard')
          return
        }
        const data = (await res.json().catch(() => ({}))) as { error?: unknown }
        fail(
          typeof data.error === 'string' && data.error
            ? data.error
            : '钉钉免登失败，请使用扫码登录',
        )
      } catch {
        fail('网络异常，钉钉免登失败，请使用扫码登录')
      }
    }

    void (async () => {
      try {
        // 仅客户端动态加载，避免 SSR 阶段执行包内读 location 的代码。
        const dd = (await import('dingtalk-jsapi')).default as unknown as DingTalkJsApi
        dd.ready(() => {
          dd.runtime.permission.requestAuthCode({
            corpId,
            clientId: process.env.NEXT_PUBLIC_DINGTALK_CLIENT_ID || undefined,
            onSuccess: ({ code }) => { void exchange(code) },
            onFail: () => fail('钉钉免登未授权，请使用扫码登录'),
          })
        })
      } catch {
        fail('钉钉 JSAPI 加载失败，请使用扫码登录')
      }
    })()
  }, [])

  if (status === 'idle') return null

  if (status === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        正在通过钉钉免登…
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="space-y-0.5">
        <p>{message}</p>
        <p className="text-muted-foreground">也可以点击下方「钉钉扫码登录」手动登录。</p>
      </div>
    </div>
  )
}
