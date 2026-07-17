import { describe, it, expect } from 'vitest'
import { hashApiKey, generateApiKey, keyPrefix } from '@/lib/crypto'

describe('hashApiKey', () => {
  it('is deterministic — same input yields same hash', () => {
    expect(hashApiKey('idrl_abc123')).toBe(hashApiKey('idrl_abc123'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashApiKey('idrl_a')).not.toBe(hashApiKey('idrl_b'))
  })

  it('returns a 64-char hex sha256 digest', () => {
    expect(hashApiKey('idrl_x')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('generateApiKey', () => {
  it('has the idrl_ prefix', () => {
    expect(generateApiKey()).toMatch(/^idrl_/)
  })

  it('is random — two calls differ', () => {
    expect(generateApiKey()).not.toBe(generateApiKey())
  })

  it('has enough entropy (>= 32 hex chars after prefix)', () => {
    expect(generateApiKey().slice('idrl_'.length).length).toBeGreaterThanOrEqual(32)
  })
})

describe('keyPrefix', () => {
  it('returns the first 12 chars of the plaintext', () => {
    const plain = 'idrl_deadbeef1234'
    expect(keyPrefix(plain)).toBe(plain.slice(0, 12))
  })
})
