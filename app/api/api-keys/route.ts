import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'
import { generateApiKey, hashApiKey, keyPrefix } from '@/lib/crypto'
import { RATE_LIMIT_DEFAULT } from '@/lib/rate-limit'
import { parseRateLimit } from '@/lib/api-key-validation'
import { logAction, actorFromAuth } from '@/lib/audit'
import type { ApiKey, ApiScope, ApiResponse } from '@/lib/types'

const ALL_SCOPES: ApiScope[] = [
  'sync:members', 'sync:attendance', 'news:publish', 'news:read', 'resource:read',
]

function isScope(v: unknown): v is ApiScope {
  return typeof v === 'string' && (ALL_SCOPES as string[]).includes(v)
}

/** GET /api/api-keys — list non-revoked keys (never returns plaintext). */
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const rows = await prisma.apiKey.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  const items: ApiKey[] = rows.map(r => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: JSON.parse(r.scopes) as ApiScope[],
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    revokedAt: null,
    rateLimitPerMin: r.rateLimitPerMin,
  }))
  const response: ApiResponse<ApiKey[]> = { success: true, data: items }
  return NextResponse.json(response)
}

/**
 * POST /api/api-keys — create a key. Body: { name, scopes: ApiScope[], rateLimitPerMin? }.
 * Returns { key } with the plaintext ONCE; it is never retrievable again.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  let body: { name?: string; scopes?: unknown; rateLimitPerMin?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body?.name || !Array.isArray(body.scopes) || body.scopes.length === 0) {
    return NextResponse.json({ error: 'name and non-empty scopes required' }, { status: 400 })
  }
  const scopes = body.scopes.filter(isScope)
  if (scopes.length === 0) {
    return NextResponse.json({ error: 'scopes must be a non-empty subset of known scopes' }, { status: 400 })
  }
  let rateLimitPerMin: number | null
  try {
    rateLimitPerMin = parseRateLimit(body.rateLimitPerMin)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'invalid rateLimitPerMin' }, { status: 400 })
  }

  const plaintext = generateApiKey()
  const created = await prisma.apiKey.create({
    data: {
      name: body.name,
      keyHash: hashApiKey(plaintext),
      prefix: keyPrefix(plaintext),
      scopes: JSON.stringify(scopes),
      rateLimitPerMin,
    },
  })
  void logAction({
    ...actorFromAuth(auth),
    action: 'apikey.create', targetType: 'apikey', targetId: created.id,
    summary: `创建密钥 ${body.name}（scopes: ${scopes.join(', ')}${rateLimitPerMin ? `, 限额 ${rateLimitPerMin}/min` : ''}）`,
  })
  // Return plaintext exactly once.
  return NextResponse.json(
    {
      id: created.id,
      name: created.name,
      scopes,
      rateLimitPerMin: rateLimitPerMin ?? RATE_LIMIT_DEFAULT,
      key: plaintext,
    },
    { status: 201 },
  )
}
