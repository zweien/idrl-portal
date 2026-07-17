import { describe, it, expect } from 'vitest'
import { titleToRole } from '@/lib/dingtalk-admin'

describe('titleToRole (DingTalk title → Person role mapping)', () => {
  it('maps 教授 → professor', () => {
    expect(titleToRole('教授')).toBe('professor')
    expect(titleToRole('Professor')).toBe('professor')
  })

  it('maps 博士后 → postdoc', () => {
    expect(titleToRole('博士后')).toBe('postdoc')
  })

  it('maps 博士 → phd (but not 博士后)', () => {
    expect(titleToRole('博士')).toBe('phd')
    expect(titleToRole('博士生')).toBe('phd')
  })

  it('maps 硕士 → master', () => {
    expect(titleToRole('硕士研究生')).toBe('master')
  })

  it('maps 本科 → undergraduate', () => {
    expect(titleToRole('本科生')).toBe('undergraduate')
  })

  it('falls back to staff for unknown/empty titles', () => {
    expect(titleToRole('科研人员')).toBe('staff')
    expect(titleToRole('')).toBe('staff')
    expect(titleToRole(undefined)).toBe('staff')
  })
})
