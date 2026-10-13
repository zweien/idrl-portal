'use client'

import { Brand } from '@/components/brand'
import { LoginForm } from '@/components/login-form'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left – form */}
      <div className="flex flex-1 items-center justify-center px-8 py-12">
        <LoginForm />
      </div>

      {/* Right – brand panel (lg+)：品牌深 navy 底，使用专用 reverse 组合 */}
      <aside className="hidden lg:flex flex-col flex-1 items-center justify-center bg-brand-navy px-12 py-16 gap-8">
        <Brand variant="bilingual" theme="dark" width={264} />

        <div className="space-y-2 text-center max-w-xs">
          <h2 className="text-lg font-semibold tracking-tight text-white">
            实验室信息聚合
          </h2>
          <p className="text-sm leading-relaxed text-white/70">
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
            <div key={label} className="flex items-center gap-2.5 text-sm text-white/80">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-cyan shrink-0" />
              {label}
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
