import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toFeedback, buildAuthorNameMap } from '@/lib/db/serialize'
import { parsePagination, totalPages as computeTotalPages } from '@/lib/pagination'
import { requireUser } from '@/lib/auth-api'
import { assertSameOrigin } from '@/lib/csrf'
import { safeErrorResponse } from '@/lib/safe-error'
import { createFeedbackBodySchema } from '@/lib/validation'
import type { Feedback, ApiResponse, PaginatedResponse } from '@/lib/types'

/** GET /api/feedback — list posts, newest-interaction first. Any logged-in user. */
export async function GET(request: Request) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const { page, pageSize } = parsePagination(searchParams)
  const status = searchParams.get('status') // 'open' | 'resolved' | undefined (all)
  const category = searchParams.get('category')

  const where: { status?: string; category?: string } = {}
  if (status === 'open' || status === 'resolved') where.status = status
  if (category) where.category = category

  // DB-level pagination: findMany already applies skip/take, so the returned
  // rows ARE the current page — do not slice again (that would empty page > 1).
  const [total, rows] = await Promise.all([
    prisma.feedback.count({ where }),
    prisma.feedback.findMany({
      where,
      orderBy: { lastReplyAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])
  const names = await buildAuthorNameMap(rows.map(r => r.userId), prisma)
  const items = rows.map(r => toFeedback(r, names))

  const response: ApiResponse<PaginatedResponse<Feedback>> = {
    success: true,
    data: { items, total, page, pageSize, totalPages: computeTotalPages(total, pageSize) },
  }
  return NextResponse.json(response)
}

/**
 * POST /api/feedback — create a post. Any logged-in user (member or admin).
 * This is the first member-writable write in the app; it uses requireUser (not
 * requireAdmin) + the same CSRF guard as every other mutation.
 */
export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const parsed = createFeedbackBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  try {
    const created = await prisma.feedback.create({
      data: {
        userId: auth.userId!,
        content: parsed.data.content,
        category: parsed.data.category,
        contact: parsed.data.contact ?? null,
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    console.error('feedback create failed:', e)
    return safeErrorResponse(e)
  }
}
