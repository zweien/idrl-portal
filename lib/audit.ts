/**
 * Audit logging for admin write operations. Records who/when/what so there's
 * an accountability trail for destructive or sensitive changes.
 *
 * logAction is fire-and-forget: it never throws (a logging failure must not
 * block the business operation). Errors are logged to console.error only.
 */

import { prisma } from '@/lib/db'
import type { SessionData } from '@/lib/session'
import type { ActorType, AuditStatus } from '@/lib/types'

export interface LogActionParams {
  actorId: string
  actorType: ActorType
  action: string
  targetType: string
  targetId?: string | null
  summary: string
  status?: AuditStatus
}

/**
 * Extract the actor identity from a session. For API-key callers the synthetic
 * session has userId `apikey:<keyId>` — strip the prefix and mark as `apikey`.
 */
export function actorFromAuth(auth: SessionData): { actorId: string; actorType: ActorType } {
  const uid = auth.userId ?? 'unknown'
  if (uid.startsWith('apikey:')) {
    return { actorId: uid.slice('apikey:'.length), actorType: 'apikey' }
  }
  return { actorId: uid, actorType: 'user' }
}

/**
 * Write one audit log row. Never throws — on DB error, logs to console only.
 */
export async function logAction(params: LogActionParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        actorType: params.actorType,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        summary: params.summary,
        status: params.status ?? 'success',
      },
    })
  } catch (e) {
    // Audit failure must not block the business operation.
    console.error('audit logAction failed:', e)
  }
}

/**
 * Delete audit logs older than `keepDays`. Called by the backup cron job.
 */
export async function pruneAuditLogs(keepDays: number): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000)
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return { deleted: result.count }
}

/** Read the configured audit log retention (Setting `auditlog.keepDays`, default 90). */
export async function readKeepDays(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: 'auditlog.keepDays' } })
  const n = row ? parseInt(row.value, 10) : 90
  return Number.isInteger(n) && n > 0 ? n : 90
}
