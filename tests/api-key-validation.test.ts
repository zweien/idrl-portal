import { describe, it, expect } from 'vitest'
import { parseRateLimit } from '@/lib/api-key-validation'

describe('parseRateLimit', () => {
  it('accepts null / undefined / empty string → null (use global default)', () => {
    expect(parseRateLimit(null)).toBeNull()
    expect(parseRateLimit(undefined)).toBeNull()
    expect(parseRateLimit('')).toBeNull()
  })

  it('accepts a positive integer (number or numeric string)', () => {
    expect(parseRateLimit(5)).toBe(5)
    expect(parseRateLimit(60)).toBe(60)
    expect(parseRateLimit('10')).toBe(10)
    expect(parseRateLimit(' 30 ')).toBe(30) // trimmed
  })

  it('rejects prefix-numeric strings (no silent parseInt coercion)', () => {
    expect(() => parseRateLimit('10abc')).toThrow()
    expect(() => parseRateLimit('1.5')).toThrow()
    expect(() => parseRateLimit('abc')).toThrow()
    expect(() => parseRateLimit('5x')).toThrow()
  })

  it('rejects non-integer and non-positive values', () => {
    expect(() => parseRateLimit(1.5)).toThrow()
    expect(() => parseRateLimit(0)).toThrow()
    expect(() => parseRateLimit(-5)).toThrow()
    expect(() => parseRateLimit('0')).toThrow()
    expect(() => parseRateLimit('-3')).toThrow()
  })

  it('rejects non-numeric types', () => {
    expect(() => parseRateLimit(true)).toThrow()
    expect(() => parseRateLimit({})).toThrow()
  })
})
