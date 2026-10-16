import { NextRequest, NextResponse } from 'next/server'
import { getAuthentikConfig } from '@/lib/authentik'
import { getDingTalkConfig } from '@/lib/dingtalk'
import { getRequestOrigin } from '@/lib/request-origin'

/**
 * GET /api/auth/providers
 * Returns which SSO providers are configured (boolean flags only — no secrets).
 * Used by the admin integration cards to reflect real availability instead
 * of a hardcoded status: a provider shows "connected" only when its env vars
 * are set (so the login route won't 503).
 *
 * 两个必须注意的点：
 * 1. force-dynamic——无 request 参数的 GET 会被 Next 在构建期静态求值，构建机的
 *    env 为空时产物把 false/false 永久烘焙进生产响应，集成状态会永远「待配置」。
 * 2. origin 来自请求（经 nginx 的 X-Forwarded-* 头）——生产模式下不传 origin 时
 *    配置 getter 因解析不出门户地址而恒返回 null。
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origin = getRequestOrigin(req)
  return NextResponse.json({
    authentik: getAuthentikConfig(origin) !== null,
    dingtalk: getDingTalkConfig(origin) !== null,
  })
}
