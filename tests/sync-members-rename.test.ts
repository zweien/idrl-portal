import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * syncMembers auto-rename: a DingTalk delete+re-add keeps the unionid but
 * mints a new userid, while Person.id embeds the userid — without the rename
 * the attendance API queries a dead id forever and the person shows absent
 * no matter how they punch. The sync must cascade-rename the row.
 */

const rawCalls: Array<{ sql: string; args: unknown[] }> = []
let existingPerson: { id: string; dingUserId: string; name: string } | null = null
let clashPerson: { id: string; name: string } | null = null

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        person: {
          findFirst: async ({ where }: { where: { dingUserId: string } }) =>
            existingPerson && existingPerson.dingUserId === where.dingUserId ? existingPerson : null,
          findUnique: async ({ where }: { where: { id: string } }) =>
            clashPerson && clashPerson.id === where.id ? clashPerson : null,
          update: async () => ({}),
          create: async () => ({}),
        },
        user: { findMany: async () => [] },
        // $executeRaw is a tagged template: (strings, ...values)
        $executeRaw: async (query: TemplateStringsArray, ...vals: unknown[]) => {
          rawCalls.push({ sql: query.join('?'), args: vals })
          return 0
        },
      }),
  },
}))

vi.mock('@/lib/dingtalk-admin', () => ({
  resetDingtalkCallCount: vi.fn(),
  getDingtalkCallCount: vi.fn(() => 0),
  listDeptMembers: vi.fn(async () => [
    { userid: 'new-uid', unionid: 'uni-1', name: '张三', title: '', email: null, mobile: null },
  ]),
}))

const { syncMembers } = await import('@/lib/dingtalk-sync')

beforeEach(() => {
  rawCalls.length = 0
  existingPerson = null
  clashPerson = null
})

describe('syncMembers userid-change rename (DingTalk delete+re-add)', () => {
  it('cascade-renames the Person row when the unionid matches but the userid changed', async () => {
    existingPerson = { id: 'dt-old-uid', dingUserId: 'uni-1', name: '张三' }
    const r = await syncMembers()
    expect(r.renamed).toBe(1)
    const sqls = rawCalls.map(c => c.sql)
    // Reference tables first, then the Person row itself.
    expect(sqls.some(s => s.includes('AttendanceRecord'))).toBe(true)
    expect(sqls.some(s => s.includes('Workstation'))).toBe(true)
    expect(sqls.some(s => s.includes('User SET personId'))).toBe(true)
    expect(sqls.some(s => s.includes('UPDATE Person SET id'))).toBe(true)
    // All raw statements carry the new id as a bound parameter.
    expect(rawCalls.filter(c => !c.sql.includes('defer_foreign_keys')).every(c => c.args.includes('dt-new-uid'))).toBe(true)
    // FK deferral is armed inside the tx.
    expect(sqls[0]).toContain('defer_foreign_keys')
  })

  it('does not rename when the target id is already taken by another row', async () => {
    existingPerson = { id: 'dt-old-uid', dingUserId: 'uni-1', name: '张三' }
    clashPerson = { id: 'dt-new-uid', name: '另一个张三' }
    const r = await syncMembers()
    expect(r.renamed).toBe(0)
    expect(rawCalls).toHaveLength(0)
  })

  it('reports renamed=0 for a stable userid (no raw statements)', async () => {
    existingPerson = { id: 'dt-new-uid', dingUserId: 'uni-1', name: '张三' }
    const r = await syncMembers()
    expect(r.renamed).toBe(0)
    expect(rawCalls).toHaveLength(0)
  })
})
