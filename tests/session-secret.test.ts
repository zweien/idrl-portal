import { describe, it, expect, afterEach, vi } from 'vitest'
import type { SessionOptions } from 'iron-session'

/**
 * sessionOptions.password is resolved from env at module load. We re-import
 * lib/session under controlled env to assert the fail-fast contract:
 *  - production + missing secret → throws on import
 *  - production + short secret (<32) → throws on import
 *  - dev + missing secret → loads (dev fallback)
 */
async function importSession(env: Record<string, string | undefined>): Promise<{
  sessionOptions: SessionOptions
}> {
  vi.resetModules()
  vi.stubEnv('SESSION_SECRET', env.SESSION_SECRET ?? '')
  vi.stubEnv('NODE_ENV', env.NODE_ENV ?? 'development')
  return import('@/lib/session')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('SESSION_SECRET fail-fast', () => {
  it('throws in production when SESSION_SECRET is missing', async () => {
    await expect(
      importSession({ NODE_ENV: 'production', SESSION_SECRET: undefined }),
    ).rejects.toThrow(/SESSION_SECRET.*required/i)
  })

  it('throws in production when SESSION_SECRET is too short (<32 chars)', async () => {
    await expect(
      importSession({ NODE_ENV: 'production', SESSION_SECRET: 'tooshort' }),
    ).rejects.toThrow(/at least 32 characters/i)
  })

  it('loads in dev with no SESSION_SECRET (dev fallback)', async () => {
    const mod = await importSession({ NODE_ENV: 'development', SESSION_SECRET: undefined })
    expect(mod.sessionOptions.password).toBeTruthy()
    expect(typeof mod.sessionOptions.password).toBe('string')
  })

  it('loads in production with a valid (>=32 char) secret', async () => {
    const valid = 'a-valid-production-secret-that-is-32+chars-long'
    const mod = await importSession({ NODE_ENV: 'production', SESSION_SECRET: valid })
    expect(mod.sessionOptions.password).toBe(valid)
  })
})
