import { join, normalize, sep } from 'node:path'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Supported image types: extension → { mime, magic }.
 * `magic` is a prefix the file's leading bytes must start with (covers the
 * common encodings we accept; we check bytes, not just the declared name).
 */
export const IMAGE_TYPES = {
  jpg: { ext: 'jpg', mime: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  jpeg: { ext: 'jpg', mime: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  png: { ext: 'png', mime: 'image/png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  gif: { ext: 'gif', mime: 'image/gif', magic: Buffer.from([0x47, 0x49, 0x46, 0x38]) },
  webp: { ext: 'webp', mime: 'image/webp', magic: Buffer.from([0x52, 0x49, 0x46, 0x46]) }, // "RIFF" (webp container)
} as const

export type ImageKind = keyof typeof IMAGE_TYPES

export class UploadValidationError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/**
 * Resolve the on-disk uploads directory. Configurable via UPLOADS_DIR for tests;
 * defaults to <project-root>/uploads.
 */
export function uploadsDir(): string {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR
  // lib/ → up one level to the project root. import.meta.url gives a valid
  // file: URL base (new URL('.') alone throws "Invalid URL").
  const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
  return join(projectRoot, 'uploads')
}

/** Random 10-hex suffix to avoid filename collisions. */
export function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 12).padEnd(10, '0')
}

/**
 * Validate a buffer against an image kind: non-empty, within size limit, and
 * matching magic bytes. Returns the canonical { ext, mime }.
 */
export function validateImage(buf: Buffer, kind: ImageKind): { ext: string; mime: string } {
  const t = IMAGE_TYPES[kind]
  if (buf.length === 0) throw new UploadValidationError('空文件')
  if (buf.length > MAX_BYTES) throw new UploadValidationError('文件超过 5MB 限制')
  if (!buf.subarray(0, t.magic.length).equals(t.magic)) {
    throw new UploadValidationError('文件内容与扩展名不符（魔数校验失败）')
  }
  // WebP is a RIFF container shared with WAV/AVI; confirm the format tag.
  if (kind === 'webp' && buf.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new UploadValidationError('文件内容与扩展名不符（非 WebP）')
  }
  return { ext: t.ext, mime: t.mime }
}

/**
 * Resolve a request path (the [...path] segments) to an absolute file path
 * inside the uploads dir, rejecting any traversal outside it.
 */
export async function resolveUploadPath(segments: string[]): Promise<{ abs: string; mime: string } | null> {
  const rel = normalize(segments.join(sep))
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) return null
  const abs = join(uploadsDir(), rel)
  const base = uploadsDir()
  if (!abs.startsWith(base + sep) && abs !== base) return null
  try {
    const s = await stat(abs)
    if (!s.isFile()) return null
  } catch {
    return null
  }
  const ext = abs.toLowerCase().split('.').pop() ?? ''
  const kind = (Object.keys(IMAGE_TYPES).find(k => IMAGE_TYPES[k as ImageKind].ext === ext)) as ImageKind | undefined
  const mime = kind ? IMAGE_TYPES[kind].mime : 'application/octet-stream'
  return { abs, mime }
}
