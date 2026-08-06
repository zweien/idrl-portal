import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { toSafeError, safeErrorResponse } from '@/lib/safe-error'

describe('toSafeError — Prisma errors are generic', () => {
  it('maps P2002 unique violation to 409', () => {
    const e = new Prisma.PrismaClientKnownRequestError('leaky detail', {
      code: 'P2002', clientVersion: '7.8.0',
    })
    const r = toSafeError(e)
    expect(r.status).toBe(409)
    expect(r.message).toMatch(/已存在/)
    expect(r.message).not.toContain('leaky')
  })

  it('maps P2003 FK failure to 409 without leaking constraint name', () => {
    const e = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed on fields: `Workstation_zoneId_fkey`',
      { code: 'P2003', clientVersion: '7.8.0' },
    )
    const r = toSafeError(e)
    expect(r.status).toBe(409)
    expect(r.message).not.toContain('Workstation')
    expect(r.message).not.toContain('fkey')
  })

  it('maps P2025 not-found to 404', () => {
    const e = new Prisma.PrismaClientKnownRequestError('record not found', {
      code: 'P2025', clientVersion: '7.8.0',
    })
    expect(toSafeError(e)).toEqual({ message: '记录不存在', status: 404 })
  })

  it('maps unknown Prisma code to generic 500', () => {
    const e = new Prisma.PrismaClientKnownRequestError('some internal', {
      code: 'P9999', clientVersion: '7.8.0',
    })
    const r = toSafeError(e)
    expect(r.status).toBe(500)
    expect(r.message).toBe('数据库操作失败')
  })

  it('maps PrismaClientValidationError to generic (no column names)', () => {
    const e = new Prisma.PrismaClientValidationError('Unknown argument `personId`', { clientVersion: '7.8.0' })
    const r = toSafeError(e)
    expect(r.message).toBe('数据库操作失败')
    expect(r.message).not.toContain('personId')
  })
})

describe('toSafeError — business errors keep their message', () => {
  it('keeps a user-facing business error message', () => {
    const e = new Error('配图 URL 无效')
    expect(toSafeError(e)).toEqual({ message: '配图 URL 无效', status: 500 })
  })
  it('keeps a custom Error subclass message', () => {
    class UploadValidationError extends Error {
      status = 400 as const
      constructor(m: string) { super(m); this.name = 'UploadValidationError' }
    }
    const e = new UploadValidationError('文件过大')
    expect(toSafeError(e).message).toBe('文件过大')
  })
  it('non-Error thrown values map to generic', () => {
    expect(toSafeError('string thrown')).toEqual({ message: '内部错误', status: 500 })
    expect(toSafeError(null)).toEqual({ message: '内部错误', status: 500 })
  })
})

describe('safeErrorResponse', () => {
  it('builds a NextResponse with the mapped message + status', async () => {
    const e = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2002', clientVersion: '7.8.0' })
    const res = safeErrorResponse(e)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/已存在/)
  })
  it('fallbackStatus overrides the mapped status', async () => {
    const e = new Prisma.PrismaClientKnownRequestError('x', { code: 'P2003', clientVersion: '7.8.0' })
    const res = safeErrorResponse(e, 400)
    expect(res.status).toBe(400)
  })
})
