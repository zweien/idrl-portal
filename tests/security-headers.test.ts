import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Security headers are configured in next.config.mjs via the `headers()`
 * function. This test guards against accidental removal or weakening of the
 * policy by asserting each required header is present with the expected
 * directives. It parses the config source (rather than importing it, which
 * would require evaluating ESM + Next config resolution) for the header lines.
 */
const configSrc = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8')

describe('security headers configuration', () => {
  it('defines a securityHeaders array applied to all routes', () => {
    expect(configSrc).toMatch(/const securityHeaders/)
    expect(configSrc).toMatch(/source:\s*'\/:path\*'/)
  })

  // Each tuple: [header key, a substring that MUST appear in the config source].
  // CSP directives live on separate lines inside the value's array literal, so
  // we search the whole config source for each directive rather than a window.
  const required: [string, RegExp][] = [
    ['Strict-Transport-Security', /max-age=\d{5,}/],
    ['X-Frame-Options', /value: 'DENY'/],
    ['Referrer-Policy', /strict-origin-when-cross-origin/],
    ['X-Content-Type-Options', /value: 'nosniff'/],
    ['Permissions-Policy', /camera=\(\)/],
    // CSP must forbid plugins, base-uri hijack, cross-origin forms, and framing.
    ['Content-Security-Policy', /object-src 'none'/],
    ['Content-Security-Policy', /base-uri 'self'/],
    ['Content-Security-Policy', /form-action 'self'/],
    ['Content-Security-Policy', /frame-ancestors 'none'/],
  ]

  for (const [key, pattern] of required) {
    it(`configures ${key} matching ${pattern}`, () => {
      const idx = configSrc.indexOf(key)
      expect(idx, `${key} missing from config`).toBeGreaterThan(-1)
      // Search the whole source — CSP directives span multiple array lines.
      expect(configSrc).toMatch(pattern)
    })
  }

  it('CSP restricts script-src to self + unsafe-inline (no unsafe-eval, no wildcards)', () => {
    const idx = configSrc.indexOf('Content-Security-Policy')
    const window = configSrc.slice(idx, idx + 600)
    expect(window).toMatch(/script-src 'self' 'unsafe-inline'/)
    // unsafe-eval and * wildcards would re-open XSS / data-exfil surface.
    expect(window).not.toMatch(/unsafe-eval/)
    expect(window).not.toMatch(/script-src[^;]*\*/)
  })
})
