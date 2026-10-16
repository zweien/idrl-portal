/**
 * Shared DingTalk identity → session sign-in, used by BOTH login paths:
 *  - the browser scan-code OAuth callback (app/api/auth/callback/dingtalk)
 *  - the in-client free-login exchange (app/api/auth/dingtalk/exchange-authcode)
 *
 * Both paths end with a unionId (Person.dingUserId stores the unionId —
 * see lib/dingtalk-sync.ts), so the user-upsert / person-linking / ban checks
 * below are identical for the two flows; only the audit wording differs.
 */

import { prisma } from '@/lib/db'
import { saveSession } from '@/lib/session'
import { logAction } from '@/lib/audit'

export type DingTalkLoginSource = 'scan' | 'in-client'

export interface DingTalkSignInInput {
  /**
   * User.externalId — the unionId on both paths (openId fallback on scan,
   * userid fallback on free-login when DingTalk omits the unionId).
   */
  externalId: string
  /**
   * Person.dingUserId to link against. Only unionIds are stored there, so
   * callers pass the unionId when known and omit it otherwise (then no
   * Person linking is attempted).
   */
  personMatchId?: string
  source: DingTalkLoginSource
}

export type DingTalkSignInOutcome =
  | { ok: true; userId: string; role: 'admin' | 'member' }
  /** `offboarded`: departed through the departure UI (first-login blocked);
   *  `disabled`: User banned by an admin. Both must NOT get a session. */
  | { ok: false; reason: 'offboarded' | 'disabled' }

/**
 * Upsert the dingtalk User for `externalId`, link the matching Person, run
 * the offboard/ban gates, sign the iron-session cookie and write the audit
 * log. Never throws for policy rejections — returns them as `reason` so each
 * route can shape its own response (redirect vs JSON).
 */
export async function signInDingTalkUser(
  input: DingTalkSignInInput,
): Promise<DingTalkSignInOutcome> {
  const { externalId, personMatchId, source } = input

  // Auto-link to a Person whose dingUserId matches. A person deliberately
  // offboarded through the departure UI must not get a session via a
  // first-time login that would auto-create their User.
  const byDing = personMatchId
    ? await prisma.person.findFirst({ where: { dingUserId: personMatchId } })
    : undefined
  if (byDing?.offboardedAt) {
    return { ok: false, reason: 'offboarded' }
  }

  const user = await prisma.user.upsert({
    where: {
      provider_externalId: { provider: 'dingtalk', externalId },
    },
    update: {
      // keep person linkage fresh: set if found, leave unchanged if not
      ...(byDing ? { personId: byDing.id } : {}),
    },
    create: {
      provider: 'dingtalk',
      externalId,
      role: 'member',
      ...(byDing ? { personId: byDing.id } : {}),
    },
  })

  // Reject banned users before signing a session.
  if (user.disabledAt) {
    return { ok: false, reason: 'disabled' }
  }

  await saveSession({
    userId: user.id,
    provider: 'dingtalk',
    role: user.role as 'admin' | 'member',
  })
  void logAction({
    actorId: user.id, actorType: 'user',
    action: 'auth.login', targetType: 'user', targetId: user.id,
    summary: source === 'scan' ? `钉钉登录（${user.role}）` : `钉钉免登（${user.role}）`,
  })

  return { ok: true, userId: user.id, role: user.role as 'admin' | 'member' }
}
