import { NextRequest, NextResponse } from 'next/server'
import { writeFile } from 'node:fs/promises'
import { mkdir } from 'node:fs'
import { join } from 'node:path'
import { requireScope } from '@/lib/auth-api'
import { logAction, actorFromAuth } from '@/lib/audit'
import { uploadsDir, validateImage, randomSuffix, IMAGE_TYPES, UploadValidationError } from '@/lib/uploads'

/**
 * POST /api/uploads — upload a news image.
 * Accepts multipart FormData with a `file` field (image/*). Validates the file
 * kind by extension, then checks the magic bytes so a renamed non-image is
 * rejected. Stores under <uploads>/<timestamp>-<random>.<ext> and returns the
 * public URL (served by GET /api/uploads/[...path]).
 *
 * Scope: news:publish (same as writing news — API key or admin session).
 */
export async function POST(req: NextRequest) {
  const auth = await requireScope(req, 'news:publish')
  if (auth instanceof NextResponse) return auth

  const formData = await req.formData()
  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: '文件未上传' }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const kind = (Object.keys(IMAGE_TYPES).find(k => k === ext || IMAGE_TYPES[k as keyof typeof IMAGE_TYPES].ext === ext)) as
    | keyof typeof IMAGE_TYPES
    | undefined
  if (!kind) {
    return NextResponse.json({ error: `仅支持 ${Object.values(new Set(Object.values(IMAGE_TYPES).map(t => t.ext))).join('/')}` }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  let mime: string
  try {
    ({ mime } = validateImage(buf, kind))
  } catch (e) {
    const msg = e instanceof UploadValidationError ? e.message : '校验失败'
    return NextResponse.json({ error: msg }, { status: e instanceof UploadValidationError ? e.status : 400 })
  }

  const dir = uploadsDir()
  mkdir(dir, { recursive: true }, () => {})
  const filename = `${Date.now()}-${randomSuffix()}.${IMAGE_TYPES[kind].ext}`
  await writeFile(join(dir, filename), buf)

  void logAction({
    ...actorFromAuth(auth),
    action: 'news.uploadImage', targetType: 'upload', targetId: filename,
    summary: `上传图片 ${filename} (${buf.length} bytes)`,
  })
  return NextResponse.json({ url: `/api/uploads/${filename}`, filename, mime }, { status: 201 })
}
