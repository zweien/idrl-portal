import { describe, it, expect } from 'vitest'
import {
  createFeedbackBodySchema,
  updateFeedbackBodySchema,
  createFeedbackReplyBodySchema,
} from '@/lib/validation'

describe('createFeedbackBodySchema', () => {
  it('accepts a minimal valid post', () => {
    const r = createFeedbackBodySchema.safeParse({
      content: '登录页面在手机上按钮错位',
      category: 'bug',
    })
    expect(r.success).toBe(true)
  })
  it('accepts contact as optional', () => {
    const r = createFeedbackBodySchema.safeParse({
      content: '建议增加导出功能',
      category: 'suggestion',
      contact: '张三 13800000000',
    })
    expect(r.success).toBe(true)
  })
  it('rejects content shorter than 5 chars', () => {
    const r = createFeedbackBodySchema.safeParse({ content: 'ab', category: 'bug' })
    expect(r.success).toBe(false)
  })
  it('rejects content longer than 2000 chars', () => {
    const r = createFeedbackBodySchema.safeParse({ content: 'x'.repeat(2001), category: 'bug' })
    expect(r.success).toBe(false)
  })
  it('rejects an invalid category', () => {
    const r = createFeedbackBodySchema.safeParse({ content: 'valid content here', category: 'complaint' })
    expect(r.success).toBe(false)
  })
  it('strips unknown keys', () => {
    const r = createFeedbackBodySchema.safeParse({ content: 'valid content here', category: 'bug', inject: 'drop' })
    expect(r.success).toBe(true)
    if (r.success) expect('inject' in r.data).toBe(false)
  })
  it('accepts all four categories', () => {
    for (const category of ['bug', 'suggestion', 'question', 'other']) {
      const r = createFeedbackBodySchema.safeParse({ content: 'valid content here', category })
      expect(r.success, category).toBe(true)
    }
  })
})

describe('updateFeedbackBodySchema (status)', () => {
  it('accepts open and resolved', () => {
    expect(updateFeedbackBodySchema.safeParse({ status: 'open' }).success).toBe(true)
    expect(updateFeedbackBodySchema.safeParse({ status: 'resolved' }).success).toBe(true)
  })
  it('rejects other status values', () => {
    expect(updateFeedbackBodySchema.safeParse({ status: 'closed' }).success).toBe(false)
    expect(updateFeedbackBodySchema.safeParse({ status: 'in_progress' }).success).toBe(false)
  })
})

describe('createFeedbackReplyBodySchema', () => {
  it('accepts non-empty content', () => {
    expect(createFeedbackReplyBodySchema.safeParse({ content: '我也遇到同样问题' }).success).toBe(true)
  })
  it('rejects empty content', () => {
    expect(createFeedbackReplyBodySchema.safeParse({ content: '' }).success).toBe(false)
    expect(createFeedbackReplyBodySchema.safeParse({ content: '   ' }).success).toBe(false)
  })
  it('rejects content over 2000 chars', () => {
    expect(createFeedbackReplyBodySchema.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false)
  })
})
