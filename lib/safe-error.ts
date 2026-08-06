/**
 * Map a thrown error to a client-safe error message + HTTP status.
 *
 * Route handlers used to return `e.message` directly, which for Prisma errors
 * leaks schema details (table/column/constraint names — e.g. "Foreign key
 * constraint failed on the fields: `Workstation_zoneId_fkey`"). This helper
 * converts known Prisma error codes to generic user-facing messages; other
 * Error instances keep their message (those are intentional business-validation
 * throws authored with user-facing copy). The original is logged server-side
 * by the caller.
 */

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

export interface SafeErrorResult {
  message: string
  status: number
}

const PRISMA_MESSAGES: Record<string, { message: string; status: number }> = {
  // Unique constraint violation
  P2002: { message: '记录已存在（唯一约束冲突）', status: 409 },
  // Foreign key constraint failed
  P2003: { message: '关联数据不存在或存在冲突', status: 409 },
  // Referenced FK still exists (Restrict)
  P2014: { message: '该记录仍被其他数据引用，无法操作', status: 409 },
  // Record not found (update/delete on missing row)
  P2025: { message: '记录不存在', status: 404 },
}

/**
 * Map an error to a safe {message, status}. Prisma errors are mapped to
 * generic messages (never leak internals); other Error subclasses keep their
 * message — these are intentional business-validation throws with user-facing
 * copy (e.g. UploadValidationError, `throw new Error('配图 URL 无效')`).
 */
export function toSafeError(e: unknown): SafeErrorResult {
  // Prisma known errors → generic message, never leak internals.
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_MESSAGES[e.code]
    if (mapped) return mapped
    return { message: '数据库操作失败', status: 500 }
  }
  // Prisma unknown/validation errors — internal, never leak.
  if (e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientValidationError) {
    return { message: '数据库操作失败', status: 500 }
  }
  // Business errors keep their message (authored to show to users).
  if (e instanceof Error) return { message: e.message, status: 500 }
  return { message: '内部错误', status: 500 }
}

/**
 * Build a NextResponse for a caught error, returning a safe message.
 *
 *   } catch (e) {
 *     console.error('news create failed:', e)
 *     return safeErrorResponse(e)
 *   }
 *
 * `fallbackStatus` overrides the mapped status when the caller knows better
 * (e.g. a 400 for a user-input-driven operation that failed at the DB layer).
 */
export function safeErrorResponse(e: unknown, fallbackStatus?: number): NextResponse {
  const { message, status } = toSafeError(e)
  return NextResponse.json({ error: message }, { status: fallbackStatus ?? status })
}
