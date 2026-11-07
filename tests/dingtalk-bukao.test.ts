import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseBuKaoDays, fetchBuKaoApprovals, buKaoNextSince, parseDingTalkCreateTime } from '@/lib/dingtalk-admin'

// 补卡 (attendance correction) sweep: parse the corrected day from an
// instance's form, sweep approvals created since a moving marker, and compute
// the next marker (pending instances keep themselves inside the window).

describe('parseBuKaoDays (补卡 form → corrected day)', () => {
  // 2026-11-03T14:00:00Z = 2026-11-03 22:00 Shanghai — deliberately NOT a
  // Shanghai-midnight anchor, so a wrong day conversion shows up.
  const REPAIR_MS = new Date('2026-11-03T14:00:00Z').getTime()
  // 2026-11-03T00:00:00Z = 2026-11-03 08:00 Shanghai (the shift's OnDuty time).
  const WORKDATE_MS = new Date('2026-11-03T00:00:00Z').getTime()

  it('parses repairCheckTime (ms epoch → Shanghai calendar day)', () => {
    const form = [
      { name: '补卡理由', value: '值班忘记打卡' },
      { name: '图片', value: null as unknown as string },
      { name: 'repairCheckTime', value: String(REPAIR_MS) },
    ]
    expect(parseBuKaoDays(form)).toEqual(['2026-11-03'])
  })

  it('parses the DDDateField extValue workDate (shift calendar day)', () => {
    const form = [{
      name: '',
      value: JSON.stringify([{
        componentName: 'DDDateField',
        componentType: 'DDDateField',
        extValue: JSON.stringify({ workDate: WORKDATE_MS, planText: '周二上班(11.03 08:00) 缺卡' }),
        props: { bizAlias: 'userCheckTime' },
      }]),
    }]
    expect(parseBuKaoDays(form)).toEqual(['2026-11-03'])
  })

  it('dedupes when both field shapes point at the same day (real form)', () => {
    // Real instance shape: DDDateField array + 补卡理由 + repairCheckTime.
    const form = [
      {
        name: '',
        value: JSON.stringify([{
          componentName: 'DDDateField',
          componentType: 'DDDateField',
          extValue: JSON.stringify({
            workDate: WORKDATE_MS,
            planText: '2026-11-03,星期二,学生打卡,下班时间17:40',
          }),
          props: { bizAlias: 'userCheckTime', format: 'yyyy-MM-dd HH:mm' },
        }]),
      },
      { name: '补卡理由', value: '实际到岗办公，未打卡' },
      { name: '图片', value: null as unknown as string },
      { name: 'repairCheckTime', value: String(WORKDATE_MS) },
    ]
    expect(parseBuKaoDays(form)).toEqual(['2026-11-03'])
  })

  it('accepts a string-numeric workDate', () => {
    const form = [{
      name: '',
      value: JSON.stringify([{ props: { bizAlias: 'userCheckTime' }, extValue: JSON.stringify({ workDate: String(WORKDATE_MS) }) }]),
    }]
    expect(parseBuKaoDays(form)).toEqual(['2026-11-03'])
  })

  it('ignores null/absent values and non-JSON components without crashing', () => {
    const form = [
      { name: '补卡理由', value: null as unknown as string },
      { name: '图片', value: 'null' },
      { name: '备注', value: '一些纯文本' },
    ]
    expect(parseBuKaoDays(form)).toEqual([])
  })

  it('collects multiple days when a form carries several date fields', () => {
    const otherMs = new Date('2026-10-28T00:00:00Z').getTime()
    const form = [
      { name: 'repairCheckTime', value: String(REPAIR_MS) },
      {
        name: '',
        value: JSON.stringify([{ props: { bizAlias: 'userCheckTime' }, extValue: JSON.stringify({ workDate: otherMs }) }]),
      },
    ]
    expect(parseBuKaoDays(form).sort()).toEqual(['2026-10-28', '2026-11-03'])
  })
})

describe('buKaoNextSince (next sweep marker)', () => {
  const NOW = new Date('2026-11-07T12:00:00Z').getTime()

  it('re-lists from the oldest pending instance (flip pickup)', () => {
    const pending = NOW - 3 * 24 * 60 * 60 * 1000
    expect(buKaoNextSince(pending, NOW)).toBe(pending - 1000)
  })

  it('falls back to a 24h lookback with no pending instances', () => {
    expect(buKaoNextSince(null, NOW)).toBe(NOW - 24 * 60 * 60 * 1000)
  })

  it('clamps to the 30-day listing cap', () => {
    const ancient = NOW - 60 * 24 * 60 * 60 * 1000
    expect(buKaoNextSince(ancient, NOW)).toBe(NOW - 30 * 24 * 60 * 60 * 1000)
  })
})

describe('parseDingTalkCreateTime (number / epoch string / Shanghai wall clock)', () => {
  it('passes through finite positive numbers', () => {
    const ms = new Date('2026-11-06T00:40:07Z').getTime()
    expect(parseDingTalkCreateTime(ms)).toBe(ms)
    expect(parseDingTalkCreateTime(0)).toBeNull()
    expect(parseDingTalkCreateTime(-5)).toBeNull()
    expect(parseDingTalkCreateTime(Number.NaN)).toBeNull()
  })

  it('parses epoch-digit strings', () => {
    const ms = new Date('2026-11-06T00:40:07Z').getTime()
    expect(parseDingTalkCreateTime(String(ms))).toBe(ms)
    expect(parseDingTalkCreateTime('  ' + ms + ' ')).toBe(ms)
  })

  it('anchors "yyyy-MM-dd HH:mm:ss" wall clocks at Asia/Shanghai (real API shape)', () => {
    // DingTalk returns create_time as "2026-11-07 11:22:37" Shanghai wall
    // clock — must NOT depend on the host timezone.
    expect(parseDingTalkCreateTime('2026-11-07 11:22:37')).toBe(new Date('2026-11-07T11:22:37+08:00').getTime())
    expect(parseDingTalkCreateTime('2026-11-07 11:22')).toBe(new Date('2026-11-07T11:22:00+08:00').getTime())
    expect(parseDingTalkCreateTime('2026-11-07T11:22:37')).toBe(new Date('2026-11-07T11:22:37+08:00').getTime())
  })

  it('returns null for garbage', () => {
    expect(parseDingTalkCreateTime('not a date')).toBeNull()
    expect(parseDingTalkCreateTime('')).toBeNull()
    expect(parseDingTalkCreateTime(null)).toBeNull()
    expect(parseDingTalkCreateTime(undefined)).toBeNull()
    expect(parseDingTalkCreateTime({})).toBeNull()
  })
})

describe('fetchBuKaoApprovals (mocked DingTalk API)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.DINGTALK_BUKAO_PROCESS_CODE
  })

  // Module-level detail cache persists across cases — unique instance ids.
  let instanceCounter = 0

  interface InstSpec {
    status?: string
    result?: string
    create_time?: number
    originator?: string
    form?: unknown[]
  }

  function dayForm(ms: number): unknown[] {
    return [
      {
        name: '',
        value: JSON.stringify([{
          componentName: 'DDDateField',
          componentType: 'DDDateField',
          extValue: JSON.stringify({ workDate: ms }),
          props: { bizAlias: 'userCheckTime' },
        }]),
      },
      { name: 'repairCheckTime', value: String(ms) },
    ]
  }

  function stubBuKaoApi(instances: Record<string, InstSpec>, detailMode: 'ok' | 'http500' | 'errcode' = 'ok') {
    const captured: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (u.includes('processinstance/listids')) {
        captured.push(body)
        return new Response(JSON.stringify({ errcode: 0, result: { list: Object.keys(instances), next_cursor: undefined } }), { status: 200 })
      }
      if (u.includes('processinstance/get')) {
        const spec = instances[String(body.process_instance_id)]
        if (!spec) throw new Error(`unexpected instance ${String(body.process_instance_id)}`)
        if (detailMode === 'http500') return new Response('server error', { status: 500 })
        if (detailMode === 'errcode') {
          return new Response(JSON.stringify({ errcode: 90018, errmsg: 'instance gone' }), { status: 200 })
        }
        return new Response(JSON.stringify({
          process_instance: {
            status: spec.status ?? 'COMPLETED',
            result: spec.result ?? 'agree',
            create_time: spec.create_time ?? Date.now(),
            originator_userid: spec.originator,
            form_component_values: spec.form ?? [],
          },
        }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${u}`)
    }))
    return captured
  }

  it('attributes an approved correction to the synced originator', async () => {
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    const dayMs = Date.now() - 5 * 24 * 60 * 60 * 1000
    stubBuKaoApi({ [`inst-bk-${++instanceCounter}`]: { originator: 'u_worker', form: dayForm(dayMs) } })
    const r = await fetchBuKaoApprovals('token', ['u_worker'], Date.now() - 24 * 60 * 60 * 1000)
    expect(r.approved).toBe(1)
    expect(r.daysByUser.get('u_worker')?.size).toBe(1)
    expect([...r.daysByUser.get('u_worker')!][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('drops corrections from people outside the synced set', async () => {
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    const dayMs = Date.now() - 5 * 24 * 60 * 60 * 1000
    stubBuKaoApi({ [`inst-bk-${++instanceCounter}`]: { originator: 'u_outsider', form: dayForm(dayMs) } })
    const r = await fetchBuKaoApprovals('token', ['u_worker'], Date.now() - 24 * 60 * 60 * 1000)
    expect(r.approved).toBe(1)
    expect(r.daysByUser.size).toBe(0)
  })

  it('a pending (RUNNING) instance pins the next sweep marker and adds no days', async () => {
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    const createTime = Date.now() - 2 * 60 * 60 * 1000
    stubBuKaoApi({ [`inst-bk-${++instanceCounter}`]: { status: 'RUNNING', create_time: createTime, originator: 'u_worker', form: [] } })
    const r = await fetchBuKaoApprovals('token', ['u_worker'], Date.now() - 24 * 60 * 60 * 1000)
    expect(r.daysByUser.size).toBe(0)
    expect(Math.abs(r.nextSinceMs - (createTime - 1000))).toBeLessThan(3000)
  })

  it('REGRESSION: a wall-clock-string create_time still pins the marker', async () => {
    // DingTalk returns create_time as "yyyy-MM-dd HH:mm:ss" (Asia/Shanghai).
    // A pending instance whose creation falls outside the 24h lookback must
    // still pin the sweep — a numeric-only check silently dropped the pin and
    // the approval flip was lost forever. The fixture is derived from the
    // test clock (6 days back) so the 30-day listing cap can never clamp it.
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    const expectedMs = Math.floor((Date.now() - 6 * 24 * 60 * 60 * 1000) / 1000) * 1000
    // Shanghai wall clock of expectedMs: shift by +08:00, take the ISO
    // timestamp part, swap the T for a space.
    const wallClock = new Date(expectedMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    expect(wallClock).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    stubBuKaoApi({ [`inst-bk-${++instanceCounter}`]: { status: 'RUNNING', create_time: wallClock, originator: 'u_worker', form: [] } })
    const r = await fetchBuKaoApprovals('token', ['u_worker'], Date.now() - 24 * 60 * 60 * 1000)
    expect(r.daysByUser.size).toBe(0)
    expect(Math.abs(r.nextSinceMs - (expectedMs - 1000))).toBeLessThan(3000)
  })

  it('a failed detail fetch (HTTP 500) pins the marker to the window start', async () => {
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    const since = Date.now() - 24 * 60 * 60 * 1000
    stubBuKaoApi({ [`inst-bk-${++instanceCounter}`]: { originator: 'u_worker', form: [] } }, 'http500')
    const r = await fetchBuKaoApprovals('token', ['u_worker'], since)
    // Not the plain lookback: retrying the same window next sync must
    // re-fetch the failed instance instead of advancing past it.
    expect(Math.abs(r.nextSinceMs - (since - 1000))).toBeLessThan(3000)
  })

  it('a failed detail fetch (HTTP 200 + errcode) pins the marker too', async () => {
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    const since = Date.now() - 12 * 60 * 60 * 1000
    stubBuKaoApi({ [`inst-bk-${++instanceCounter}`]: { originator: 'u_worker', form: [] } }, 'errcode')
    const r = await fetchBuKaoApprovals('token', ['u_worker'], since)
    expect(Math.abs(r.nextSinceMs - (since - 1000))).toBeLessThan(3000)
  })

  it('a REJECTED instance is terminal: no days, lookback marker', async () => {
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    const dayMs = Date.now() - 5 * 24 * 60 * 60 * 1000
    stubBuKaoApi({ [`inst-bk-${++instanceCounter}`]: { status: 'COMPLETED', result: 'refuse', originator: 'u_worker', form: dayForm(dayMs) } })
    const r = await fetchBuKaoApprovals('token', ['u_worker'], Date.now() - 24 * 60 * 60 * 1000)
    expect(r.daysByUser.size).toBe(0)
    expect(r.nextSinceMs).toBeLessThanOrEqual(Date.now() - 23 * 60 * 60 * 1000)
  })

  it('mixes pending + approved: days from the approved, marker from the pending', async () => {
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    const pendingAt = Date.now() - 8 * 24 * 60 * 60 * 1000
    const dayMs = Date.now() - 3 * 24 * 60 * 60 * 1000
    stubBuKaoApi({
      [`inst-bk-${++instanceCounter}`]: { status: 'RUNNING', create_time: pendingAt, originator: 'u_worker', form: [] },
      [`inst-bk-${++instanceCounter}`]: { create_time: Date.now() - 3 * 60 * 60 * 1000, originator: 'u_worker', form: dayForm(dayMs) },
    })
    const r = await fetchBuKaoApprovals('token', ['u_worker'], Date.now() - 24 * 60 * 60 * 1000)
    expect(r.daysByUser.get('u_worker')?.size).toBe(1)
    expect(Math.abs(r.nextSinceMs - (pendingAt - 1000))).toBeLessThan(3000)
  })

  it('filters corrections targeting a future day', async () => {
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    stubBuKaoApi({ [`inst-bk-${++instanceCounter}`]: { originator: 'u_worker', form: dayForm(Date.now() + 24 * 60 * 60 * 1000) } })
    const r = await fetchBuKaoApprovals('token', ['u_worker'], Date.now() - 24 * 60 * 60 * 1000)
    expect(r.daysByUser.size).toBe(0)
  })

  it('no env config → empty sweep, marker unchanged', async () => {
    const since = Date.now() - 99 * 60 * 60 * 1000
    const r = await fetchBuKaoApprovals('token', ['u_worker'], since)
    expect(r.seen).toBe(0)
    expect(r.nextSinceMs).toBe(since)
  })

  it('clamps the listing start to the 30-day cap', async () => {
    process.env.DINGTALK_BUKAO_PROCESS_CODE = 'PROC-TEST'
    const captured = stubBuKaoApi({})
    const ancient = Date.now() - 60 * 24 * 60 * 60 * 1000
    await fetchBuKaoApprovals('token', ['u_worker'], ancient)
    expect(captured[0].start_time).toBeGreaterThan(Date.now() - 31 * 24 * 60 * 60 * 1000)
  })
})
