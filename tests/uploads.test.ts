import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { validateImage, resolveUploadPath, randomSuffix, uploadsDir, IMAGE_TYPES, UploadValidationError } from '@/lib/uploads'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('validateImage', () => {
  it('accepts a real PNG with matching magic bytes', () => {
    const buf = Buffer.concat([pngHeader, Buffer.alloc(8, 0)])
    const { ext, mime } = validateImage(buf, 'png')
    expect(ext).toBe('png')
    expect(mime).toBe('image/png')
  })

  it('rejects an empty buffer', () => {
    expect(() => validateImage(Buffer.alloc(0), 'png')).toThrow(UploadValidationError)
  })

  it('rejects a buffer over 5MB', () => {
    const buf = Buffer.concat([pngHeader, Buffer.alloc(5 * 1024 * 1024 + 1, 0)])
    expect(() => validateImage(buf, 'png')).toThrow('5MB')
  })

  it('rejects mismatched magic bytes (renamed non-image)', () => {
    // A PNG extension but the bytes are plain text — magic check must fail.
    const buf = Buffer.from('not-a-png-at-all-this-is-text')
    expect(() => validateImage(buf, 'png')).toThrow('魔数')
  })

  it('recognizes each accepted kind by its magic prefix', () => {
    const cases: Array<[keyof typeof IMAGE_TYPES, number[]]> = [
      ['jpg', [0xff, 0xd8, 0xff, 0xe0]],
      ['jpeg', [0xff, 0xd8, 0xff, 0xe1]],
      ['gif', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
      // RIFF....WEBP — a real WebP header.
      ['webp', [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]],
    ]
    for (const [kind, header] of cases) {
      expect(() => validateImage(Buffer.from(header), kind)).not.toThrow()
    }
  })

  it('rejects a RIFF file whose format tag is not WEBP (e.g. WAV)', () => {
    // RIFF....WAVE — a WAV header renamed to .webp must fail.
    const wav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45])
    expect(() => validateImage(wav, 'webp')).toThrow('WebP')
  })
})

describe('randomSuffix', () => {
  it('returns a 10-char hex-ish string', () => {
    const s = randomSuffix()
    expect(s).toHaveLength(10)
    expect(s).toMatch(/^[0-9a-f]+$/)
  })
})

describe('uploadsDir default', () => {
  it('resolves without throwing when UPLOADS_DIR is unset', () => {
    const saved = process.env.UPLOADS_DIR
    delete process.env.UPLOADS_DIR
    try {
      const dir = uploadsDir()
      expect(typeof dir).toBe('string')
      expect(dir.length).toBeGreaterThan(0)
      expect(dir.endsWith('uploads')).toBe(true)
    } finally {
      process.env.UPLOADS_DIR = saved
    }
  })
})

describe('resolveUploadPath', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'idrl-up-'))
    process.env.UPLOADS_DIR = dir
  })
  afterAll(() => {
    delete process.env.UPLOADS_DIR
    rmSync(dir, { recursive: true, force: true })
  })

  it('resolves an existing image file with the right mime', async () => {
    const p = join(dir, '1690000000000-abc12345.png')
    writeFileSync(p, pngHeader)
    const r = await resolveUploadPath(['1690000000000-abc12345.png'])
    expect(r?.abs).toBe(p)
    expect(r?.mime).toBe('image/png')
  })

  it('returns null for a missing file', async () => {
    expect(await resolveUploadPath(['nope.png'])).toBeNull()
  })

  it('rejects path traversal outside the uploads dir', async () => {
    expect(await resolveUploadPath(['..', '..', 'etc', 'passwd'])).toBeNull()
    expect(await resolveUploadPath(['sub', '..', '..', 'escape.png'])).toBeNull()
  })
})
