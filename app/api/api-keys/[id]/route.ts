import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import type { ApiScope } from '@/lib/types'

const ALL_SCOPES: ApiScope[] = [
  'sync:members', 'sync:attendance', 'news:publish', 'news:read', 'resource:read',
]

/**
 * PATCH /api/api-keys/:id — edit a key's name, scopes, per-key rate limit, and
 * optionally reset its counter. Body (all optional):
 *   { name?, scopes?, rateLimitPerMin?, resetCounter?: boolean }
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  let body: {
    name?: string
    scopes?: unknown
    rateLimitPerMin?: unknown
    resetCounter?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const data: {
    name?: string
    scopes?: string
    rateLimitPerMin?: number | null
    rlCount?: number
    rlWindowStart?: null
  } = {}
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    data.name = body.name.trim()
  }
  if (body.scopes !== undefined) {
    if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
      return NextResponse.json({ error: 'scopes must be a non-empty array' }, { status: 400 })
    }
    const scopes = body.scopes.filter((v): v is ApiScope => typeof v === 'string' && (ALL_SCOPES as string[]).includes(v))
    if (scopes.length === 0) {
      return NextResponse.json({ error: 'scopes must be a non-empty subset of known scopes' }, { status: 400 })
    }
    data.scopes = JSON.stringify(scopes)
  }
  if (body.rateLimitPerMin !== undefined) {
    const v = body.rateLimitPerMin
    if (v === null || v === '') {
      data.rateLimitPerMin = null
    } else {
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ error: 'rateLimitPerMin must be a positive integer or null' }, { status: 400 })
      }
      data.rateLimitPerMin = n
    }
  }
  if (body.resetCounter) {
    // Reset both the count and the window so the new limit takes effect at once.
    data.rlCount = 0
    data.rlWindowStart = null
  }

  try {
    await prisma.apiKey.update({ where: { id }, data })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

/** DELETE /api/api-keys/:id — revoke (soft delete) an API key. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  try {
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
