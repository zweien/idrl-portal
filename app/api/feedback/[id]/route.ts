import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toFeedback, toFeedbackReply, buildAuthorNameMap } from '@/lib/db/serialize'
import { requireUser } from '@/lib/auth-api'
import { assertSameOrigin } from '@/lib/csrf'
import { safeErrorResponse } from '@/lib/safe-error'
import { updateFeedbackBodySchema } from '@/lib/validation'
import type { Feedback, FeedbackReply, ApiResponse } from '@/lib/types'

interface Ctx {
  params: Promise<{ id: string }>
}

/**
 * GET /api/feedback/:id — a post + its replies (oldest first). Any logged-in
 * user (the board is public among members).
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const post = await prisma.feedback.findUnique({ where: { id } })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const replies = await prisma.feedbackReply.findMany({
    where: { feedbackId: id },
    orderBy: { createdAt: 'asc' },
  })
  const names = await buildAuthorNameMap([post.userId, ...replies.map(r => r.userId)], prisma)
  const data: ApiResponse<{ post: Feedback; replies: FeedbackReply[] }> = {
    success: true,
    data: { post: toFeedback(post, names), replies: replies.map(r => toFeedbackReply(r, names)) },
  }
  return NextResponse.json(data)
}

/**
 * DELETE /api/feedback/:id — delete a post (and its replies via Cascade).
 * The author may delete their own; admins may delete any. Other users get 403.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const post = await prisma.feedback.findUnique({ where: { id }, select: { userId: true } })
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const isOwner = post.userId === auth.userId
  const isAdmin = auth.role === 'admin'
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    await prisma.feedback.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('feedback delete failed:', e)
    return safeErrorResponse(e)
  }
}

/**
 * PATCH /api/feedback/:id — change status (open/resolved). Admin-only: status
 * is the admin-side workflow signal, not something the author controls.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const parsed = updateFeedbackBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  try {
    const updated = await prisma.feedback.update({
      where: { id },
      data: { status: parsed.data.status },
    })
    return NextResponse.json(updated)
  } catch (e) {
    console.error('feedback status update failed:', e)
    return safeErrorResponse(e)
  }
}
