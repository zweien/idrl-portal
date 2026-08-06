import { describe, it, expect } from 'vitest'
import { toFeedback, toFeedbackReply } from '@/lib/db/serialize'
import type { Feedback as DBFeedback, FeedbackReply as DBFeedbackReply } from '@prisma/client'

/** Build a minimal DB-shaped Feedback row for serialize tests. */
function dbFeedback(over: Partial<DBFeedback> = {}): DBFeedback {
  return {
    id: 'f1',
    userId: 'u1',
    content: '内容',
    category: 'bug',
    contact: null,
    status: 'open',
    replyCount: 0,
    lastReplyAt: new Date('2026-08-06T01:00:00Z'),
    createdAt: new Date('2026-08-06T00:00:00Z'),
    ...over,
  } as DBFeedback
}

function dbReply(over: Partial<DBFeedbackReply> = {}): DBFeedbackReply {
  return {
    id: 'r1',
    feedbackId: 'f1',
    userId: 'u1',
    content: '回复',
    createdAt: new Date('2026-08-06T00:30:00Z'),
    ...over,
  } as DBFeedbackReply
}

describe('toFeedback', () => {
  it('maps fields and ISO-formats timestamps', () => {
    const out = toFeedback(dbFeedback(), new Map([['u1', '张三']]))
    expect(out.id).toBe('f1')
    expect(out.authorName).toBe('张三')
    expect(out.category).toBe('bug')
    expect(out.status).toBe('open')
    expect(out.createdAt).toBe('2026-08-06T00:00:00.000Z')
    expect(out.lastReplyAt).toBe('2026-08-06T01:00:00.000Z')
  })

  it('falls back to a short userId suffix when the author is unknown (deleted user)', () => {
    // slice(-6) takes the LAST 6 chars of the userId.
    const out = toFeedback(dbFeedback({ userId: 'user-abc123456' }), new Map())
    expect(out.authorName).toBe('用户:123456') // last 6 chars
    expect(out.authorName).toMatch(/^用户:/)
  })

  it('preserves contact as null when absent', () => {
    expect(toFeedback(dbFeedback({ contact: null }), new Map()).contact).toBeNull()
    expect(toFeedback(dbFeedback({ contact: 'x@y' }), new Map()).contact).toBe('x@y')
  })
})

describe('toFeedbackReply', () => {
  it('maps fields and uses the author name map', () => {
    const out = toFeedbackReply(dbReply({ userId: 'u2' }), new Map([['u2', '李四']]))
    expect(out.authorName).toBe('李四')
    expect(out.feedbackId).toBe('f1')
    expect(out.createdAt).toBe('2026-08-06T00:30:00.000Z')
  })
})
