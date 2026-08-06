import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth-api'
import { assertSameOrigin } from '@/lib/csrf'
import { safeErrorResponse } from '@/lib/safe-error'

interface Ctx {
  params: Promise<{ id: string; replyId: string }>
}

/**
 * DELETE /api/feedback/:id/replies/:replyId — delete a reply. The author may
 * delete their own; admins may delete any. Decrements the parent's replyCount.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id, replyId } = await params

  const reply = await prisma.feedbackReply.findUnique({
    where: { id: replyId },
    select: { userId: true, feedbackId: true },
  })
  if (!reply) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // Guard against mismatched :id in the path (reply belongs to a different post).
  if (reply.feedbackId !== id) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const isOwner = reply.userId === auth.userId
  const isAdmin = auth.role === 'admin'
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    // Delete the reply, then recompute the parent's denormalized fields in one
    // transaction: replyCount decrements, and lastReplyAt is set to the newest
    // REMAINING reply's createdAt (or the post's own createdAt if none remain).
    // Without recomputing lastReplyAt, deleting the latest reply would leave the
    // post incorrectly pinned at the top of the list (ordered by lastReplyAt).
    await prisma.$transaction(async (tx) => {
      await tx.feedbackReply.delete({ where: { id: replyId } })
      const newest = await tx.feedbackReply.findFirst({
        where: { feedbackId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      // lastReplyAt falls back to the post's creation time when no replies left.
      const parent = await tx.feedback.findUnique({ where: { id }, select: { createdAt: true } })
      await tx.feedback.update({
        where: { id },
        data: {
          replyCount: { decrement: 1 },
          lastReplyAt: newest?.createdAt ?? parent?.createdAt ?? new Date(),
        },
      })
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('feedback reply delete failed:', e)
    return safeErrorResponse(e)
  }
}
