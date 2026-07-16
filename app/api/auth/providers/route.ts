import { NextResponse } from 'next/server'
import { getAuthentikConfig } from '@/lib/authentik'
import { getDingTalkConfig } from '@/lib/dingtalk'

/**
 * GET /api/auth/providers
 * Returns which SSO providers are configured (boolean flags only — no secrets).
 * Used by the admin integration cards to reflect real availability instead
 * of a hardcoded status: a provider shows "connected" only when its env vars
 * are set (so the login route won't 503).
 */
export async function GET() {
  return NextResponse.json({
    authentik: getAuthentikConfig() !== null,
    dingtalk: getDingTalkConfig() !== null,
  })
}
