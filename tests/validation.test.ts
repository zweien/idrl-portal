import { describe, it, expect } from 'vitest'
import {
  personSchema, newsItemSchema, resourceSchema,
  adminDataBodySchema, createNewsBodySchema, updateNewsBodySchema,
} from '@/lib/validation'

describe('personSchema', () => {
  it('accepts a well-formed person', () => {
    const r = personSchema.safeParse({
      id: 'p1', name: 'Alice', role: '研究员', status: 'present',
      researchAreas: ['CV'],
    })
    expect(r.success).toBe(true)
  })
  it('strips unknown keys (no extra fields reach Prisma)', () => {
    const r = personSchema.safeParse({
      id: 'p1', name: 'Alice', role: '研究员', status: 'present',
      evilExtraField: 'drop me',
    })
    expect(r.success).toBe(true)
    if (r.success) expect('evilExtraField' in r.data).toBe(false)
  })
  it('rejects an invalid status enum', () => {
    const r = personSchema.safeParse({ id: 'p1', name: 'A', role: 'r', status: 'bogus' })
    expect(r.success).toBe(false)
  })
  it('rejects a numeric id', () => {
    const r = personSchema.safeParse({ id: 123, name: 'A', role: 'r', status: 'present' })
    expect(r.success).toBe(false)
  })
})

describe('newsItemSchema', () => {
  it('accepts a full news item', () => {
    const r = newsItemSchema.safeParse({
      id: 'n1', title: 'T', content: 'C', date: '2026-08-06',
      status: 'published', tags: ['a', 'b'],
    })
    expect(r.success).toBe(true)
  })
  it('rejects a numeric order', () => {
    const r = newsItemSchema.safeParse({
      id: 'n1', title: 'T', content: 'C', date: '2026-08-06',
      status: 'published', order: 'five',
    })
    expect(r.success).toBe(false)
  })
  it('strips unknown keys', () => {
    const r = newsItemSchema.safeParse({
      id: 'n1', title: 'T', content: 'C', date: '2026-08-06',
      status: 'published', inject: '<script>',
    })
    expect(r.success).toBe(true)
    if (r.success) expect('inject' in r.data).toBe(false)
  })
})

describe('createNewsBodySchema / updateNewsBodySchema', () => {
  it('create omits id (server assigns it)', () => {
    const r = createNewsBodySchema.safeParse({
      title: 'T', content: 'C', date: '2026-08-06', status: 'draft',
    })
    expect(r.success).toBe(true)
  })
  it('create rejects an explicitly-provided id shape is fine but omitted from required — verify id optional', () => {
    // id is omitted from createNewsBodySchema entirely.
    const keys = createNewsBodySchema.shape
    expect('id' in keys).toBe(false)
  })
  it('update accepts a partial body', () => {
    const r = updateNewsBodySchema.safeParse({ title: 'New title' })
    expect(r.success).toBe(true)
  })
  it('update still validates field types when present', () => {
    const r = updateNewsBodySchema.safeParse({ status: 'not-a-status' })
    expect(r.success).toBe(false)
  })
})

describe('adminDataBodySchema', () => {
  it('validates the three-array structure', () => {
    const r = adminDataBodySchema.safeParse({
      personnel: [{ id: 'p1', name: 'A', role: 'r', status: 'present' }],
      news: [{ id: 'n1', title: 'T', content: 'C', date: '2026-08-06', status: 'published' }],
      resources: [{ id: 'r1', name: 'R', description: 'D', status: 'active', accessLevel: 'public' }],
    })
    expect(r.success).toBe(true)
  })
  it('rejects missing arrays', () => {
    const r = adminDataBodySchema.safeParse({ personnel: [] })
    expect(r.success).toBe(false)
  })
})

describe('resourceSchema', () => {
  it('accepts a resource with specs record', () => {
    const r = resourceSchema.safeParse({
      id: 'r1', name: 'R', description: 'D', status: 'active', accessLevel: 'member',
      specs: { cpu: '8核', ram: '32GB' },
    })
    expect(r.success).toBe(true)
  })
  it('rejects invalid accessLevel', () => {
    const r = resourceSchema.safeParse({
      id: 'r1', name: 'R', description: 'D', status: 'active', accessLevel: 'everyone',
    })
    expect(r.success).toBe(false)
  })
})
