import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toFeedbackReply, buildAuthorNameMap } from '@/lib/db/serialize'
import { requireUser } from '@/lib/auth-api'
import { assertSameOrigin } from '@/lib/csrf'
import { safeErrorResponse } from '@/lib/safe-error'
import { createFeedbackReplyBodySchema } from '@/lib/validation'

/**
 * POST /api/feedback/:id/replies — add a single-layer reply. Any logged-in
 * user. Updates the parent's denormalized replyCount + lastReplyAt so the list
 * reorders by latest interaction without a join.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  // Confirm the parent exists (FK is on feedbackId, but a clear 404 beats a
  // FK error leaking through safeError).
  const parent = await prisma.feedback.findUnique({ where: { id }, select: { id: true } })
  if (!parent) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const parsed = createFeedbackReplyBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  try {
    // Create the reply + bump the parent's counters in one transaction so the
    // denormalized counts can't drift from the replies table.
    const now = new Date()
    const [reply] = await prisma.$transaction([
      prisma.feedbackReply.create({
        data: { feedbackId: id, userId: auth.userId!, content: parsed.data.content },
      }),
      prisma.feedback.update({
        where: { id },
        data: { replyCount: { increment: 1 }, lastReplyAt: now },
      }),
    ])
    const names = await buildAuthorNameMap([reply.userId], prisma)
    return NextResponse.json(toFeedbackReply(reply, names), { status: 201 })
  } catch (e) {
    console.error('feedback reply create failed:', e)
    return safeErrorResponse(e)
  }
}
