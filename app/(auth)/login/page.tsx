'use client'

import { LoginForm } from '@/components/login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left – form */}
      <div className="flex flex-1 items-center justify-center px-8 py-12">
        <LoginForm />
      </div>

      {/* Right – decorative panel (lg+) */}
      <aside className="hidden lg:flex flex-col flex-1 items-center justify-center bg-muted/30 border-l border-border px-12 py-16 gap-8">
        <div className="space-y-2 text-center max-w-xs">
          <h2 className="text-lg font-semibold tracking-tight">实验室信息聚合</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            实时掌握人员在位状态、工位分布、算力资源与最新动态，一站式管理实验室信息。
          </p>
        </div>

        <div className="space-y-3 w-full max-w-xs">
          {[
            '人员在位状态 & 工位平面图',
            '算力、网盘、代码仓库聚合',
            '论文发表 & 实验室动态',
            'Authentik SSO / 钉钉扫码登录',
          ].map((label) => (
            <div key={label} className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              {label}
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
