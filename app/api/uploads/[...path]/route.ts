import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { resolveUploadPath } from '@/lib/uploads'

/**
 * GET /api/uploads/[...path] — serve an uploaded image.
 * Public read (the URL is embedded in news content, which is itself public).
 * Path traversal outside the uploads dir is rejected by resolveUploadPath.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const resolved = await resolveUploadPath(path)
  if (!resolved) return new NextResponse('not found', { status: 404 })

  const stream = Readable.toWeb(createReadStream(resolved.abs)) as ReadableStream<Uint8Array>
  return new NextResponse(stream, {
    headers: {
      'Content-Type': resolved.mime,
      // Uploaded images are immutable (content-addressed by filename), so a
      // long cache cuts repeated bandwidth.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
