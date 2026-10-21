import { describe, it, expect, vi, afterEach } from 'vitest'
import { mapStatusForDay, parseTripWindow, fetchTripStatus, type DayAttendance, type TripStatus } from '@/lib/dingtalk-admin'

describe('parseTripWindow (trip form → date range + reason)', () => {
  it('parses 京内 format (开始/结束时间 JSON array field)', () => {
    const form = [
      { name: '开始时间,结束时间', value: JSON.stringify(['2026-07-18 09:00', '2026-07-18 18:00']) },
      { name: '外出事由', value: '走访合作单位' },
    ]
    const w = parseTripWindow(form)
    expect(w.tripStart).not.toBeNull()
    expect(w.tripEnd).not.toBeNull()
    expect(w.tripEnd! - w.tripStart!).toBe(9 * 60 * 60 * 1000) // 9h
    expect(w.reason).toBe('走访合作单位')
  })

  it('parses 京外 format (itinerary table with startTime/endTime cells)', () => {
    const itinerary = [{
      props: { bizAlias: 'itinerary' },
      value: JSON.stringify([{
        rowValue: [
          { bizAlias: 'startTime', value: '2026-07-18 08:00' },
          { bizAlias: 'endTime', value: '2026-07-20 20:00' },
          { bizAlias: 'destination', value: '上海' },
        ],
      }]),
    }, {
      props: { bizAlias: 'reason' },
      value: '参加国际会议',
    }]
    const form = [{ name: '商旅出差', value: JSON.stringify(itinerary) }]
    const w = parseTripWindow(form)
    expect(w.tripStart).not.toBeNull()
    expect(w.tripEnd).not.toBeNull()
    expect(w.reason).toBe('参加国际会议')
  })

  it('parses 京内因公 format (separate 开始时间/结束时间 fields + 事由)', () => {
    const form = [
      { name: '开始时间', value: '2026-08-20 09:00' },
      { name: '结束时间', value: '2026-08-20 18:00' },
      { name: '事由', value: '前往中科院交流' },
    ]
    const w = parseTripWindow(form)
    expect(w.tripStart).not.toBeNull()
    expect(w.tripEnd).not.toBeNull()
    expect(w.tripEnd! - w.tripStart!).toBe(9 * 60 * 60 * 1000)
    expect(w.reason).toBe('前往中科院交流')
  })

  it('parses date-only 开始日期/结束日期 values (anchored at 00:00)', () => {
    const form = [
      { name: '开始日期', value: '2026-08-20' },
      { name: '结束日期', value: '2026-08-21' },
      { name: '外出事由', value: '市内调研' },
    ]
    const w = parseTripWindow(form)
    expect(w.tripStart).not.toBeNull()
    expect(w.tripEnd).not.toBeNull()
    expect(w.tripEnd! - w.tripStart!).toBe(24 * 60 * 60 * 1000)
    expect(w.reason).toBe('市内调研')
  })

  it('combined 开始时间,结束时间 field still wins over separate fields', () => {
    const form = [
      { name: '开始时间,结束时间', value: JSON.stringify(['2026-08-01 09:00', '2026-08-02 18:00']) },
      { name: '开始时间', value: '2026-07-01 09:00' },
    ]
    const w = parseTripWindow(form)
    expect(new Date(w.tripStart!).toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(new Date(w.tripEnd!).toISOString().slice(0, 10)).toBe('2026-08-02')
  })

  it('returns null window when no parseable dates', () => {
    const form = [{ name: '备注', value: '一些无关文本' }]
    const w = parseTripWindow(form)
    expect(w.tripStart).toBeNull()
    expect(w.tripEnd).toBeNull()
  })
})

describe('parseTripWindow — 同行人 (traveler contact field)', () => {
  // Both real templates embed the co-traveler InnerContactField inside the
  // DDBizSuite JSON with bizAlias "traveler": 京外出差 labels it
  // "出行人（同行人）", 京内因公 labels it "同行人". User ids live in
  // extValue ({emplId,name}[]); value holds display names only.
  function formWithTraveler(label: string, extValue: string | undefined, value?: string) {
    const comp: Record<string, unknown> = {
      componentName: 'InnerContactField',
      componentType: 'InnerContactField',
      props: { bizAlias: 'traveler', label },
    }
    if (extValue !== undefined) comp.extValue = extValue
    if (value !== undefined) comp.value = value
    return [{
      name: '商旅出差',
      value: JSON.stringify([
        { props: { bizAlias: 'reason' }, value: '技术交流' },
        { props: { bizAlias: 'itinerary' }, value: JSON.stringify([{ rowValue: [
          { bizAlias: 'startTime', value: '2026-10-20 上午' },
          { bizAlias: 'endTime', value: '2026-10-22 下午' },
        ]}]) },
        comp,
      ]),
    }]
  }

  it('extracts emplIds from the 京外出差 出行人（同行人）extValue', () => {
    const extValue = JSON.stringify([
      { emplId: '03683751325720980786', name: '刘怡君' },
      { emplId: '015325646052785834', name: '张磊' },
    ])
    const w = parseTripWindow(formWithTraveler('出行人（同行人）', extValue, '刘怡君,张磊'))
    expect(w.companions).toEqual(['03683751325720980786', '015325646052785834'])
    expect(w.tripStart).not.toBeNull()
  })

  it('matches the 京内因公 同行人 label via the label fallback', () => {
    const extValue = JSON.stringify([{ emplId: '633958412526187225', name: '李帅杰' }])
    const form = [{
      name: '外出',
      value: JSON.stringify([
        { props: { bizAlias: 'type' } },
        { props: { bizAlias: 'traveler', label: '同行人' }, extValue },
      ]),
    }]
    const w = parseTripWindow(form)
    expect(w.companions).toEqual(['633958412526187225'])
  })

  it('falls back to the display-name value when extValue is absent', () => {
    const w = parseTripWindow(formWithTraveler('同行人', undefined, '李家辉,张磊'))
    // Names can't resolve to userids here — the caller filters against the
    // synced userid set, where name tokens never match.
    expect(w.companions).toEqual(['李家辉', '张磊'])
  })

  it('yields no companions when the field was left empty', () => {
    // Empty fields appear WITHOUT value/extValue keys (real 外出 forms).
    const w = parseTripWindow(formWithTraveler('同行人', undefined))
    expect(w.companions).toEqual([])
  })

  it('parses a top-level 同行人 contact component (JSON userid array)', () => {
    const form = [
      { name: '开始时间,结束时间', value: JSON.stringify(['2026-07-18 09:00', '2026-07-18 18:00']) },
      { name: '同行人', value: JSON.stringify(['u_companion_1', 'u_companion_2']) },
    ]
    const w = parseTripWindow(form)
    expect(w.companions).toEqual(['u_companion_1', 'u_companion_2'])
  })

  it('originator self-listing is deduped at the attribution layer, not here', () => {
    // A traveler list that includes the originator must not break parsing;
    // fetchTripStatus dedupes via Set when building the owner list.
    const extValue = JSON.stringify([{ emplId: 'u_originator', name: '刘帅' }])
    const w = parseTripWindow(formWithTraveler('出行人（同行人）', extValue, '刘帅'))
    expect(w.companions).toEqual(['u_originator'])
  })
})

describe('mapStatusForDay (per-day priority: trip > leave > present > absent)', () => {
  const DAY = '2026-07-21'
  const tripStatus = (days: string[], reason?: string): TripStatus => ({ days: new Set(days), reason })
  const trip = new Map<string, TripStatus>([['u_trip', tripStatus([DAY], '京外出差')]])
  const leave = new Map<string, Set<string>>([['u_leave', new Set([DAY])]])
  // att: Map<uid, Map<day, DayAttendance>>
  const attDay = (timeResult: string): Map<string, Map<string, DayAttendance>> => {
    const inner = new Map<string, DayAttendance>([[DAY, { onDuty: { timeResult, checkTime: '08:01' } }]])
    return new Map([['u_present', inner]])
  }

  it('trip wins over everything', () => {
    const m = attDay('Normal')
    const l = new Map([['u_trip', new Set([DAY])]])
    expect(mapStatusForDay('u_trip', DAY, trip, l, m).status).toBe('trip')
  })

  it('trip uses .days set (not the bare value)', () => {
    // Confirm the new TripStatus shape works via the dedicated accessor.
    const t = new Map([['u_x', tripStatus([DAY])]])
    expect(mapStatusForDay('u_x', DAY, t, new Map(), new Map()).status).toBe('trip')
  })

  it('leave wins over present', () => {
    const m = attDay('Normal')
    expect(mapStatusForDay('u_leave', DAY, trip, leave, m).status).toBe('leave')
  })

  it('any real OnDuty punch (incl. Late/Early) → present', () => {
    for (const tr of ['Normal', 'Late', 'Early', 'SeriousLate']) {
      expect(mapStatusForDay('u_present', DAY, trip, leave, attDay(tr)).status).toBe('present')
    }
  })

  it('NotSigned / Absenteeism / no record → absent', () => {
    expect(mapStatusForDay('u_present', DAY, trip, leave, attDay('NotSigned')).status).toBe('absent')
    expect(mapStatusForDay('u_present', DAY, trip, leave, attDay('Absenteeism')).status).toBe('absent')
    expect(mapStatusForDay('u_unknown', DAY, trip, leave, new Map()).status).toBe('absent')
  })

  it('placeholder punches are dropped, not stored as check-in', () => {
    // attendance/list echoes the shift's base check time into userCheckTime
    // on NotSigned/Absenteeism rows even though nobody punched (absentees
    // ended up with checkIn "08:00" in exports). Placeholders must not
    // surface as punches.
    const r = mapStatusForDay('u_present', DAY, trip, leave, attDay('Absenteeism'))
    expect(r.status).toBe('absent')
    expect(r.onDuty).toBeUndefined()
    const r2 = mapStatusForDay('u_present', DAY, trip, leave, attDay('NotSigned'))
    expect(r2.onDuty).toBeUndefined()
  })

  it('absent: real OffDuty kept for record, placeholder OffDuty dropped', () => {
    const att = (off: DayAttendance['offDuty']) =>
      new Map([['u_present', new Map([[DAY, { offDuty: off }]])]])
    const real = mapStatusForDay('u_present', DAY, trip, leave,
      att({ timeResult: 'Normal', checkTime: '18:30' }))
    expect(real.status).toBe('absent')
    expect(real.offDuty?.checkTime).toBe('18:30')
    const fake = mapStatusForDay('u_present', DAY, trip, leave,
      att({ timeResult: 'NotSigned', checkTime: '18:00' }))
    expect(fake.offDuty).toBeUndefined()
  })

  it('surfaces onDuty + offDuty punches on present', () => {
    const inner = new Map<string, DayAttendance>([
      [DAY, {
        onDuty: { timeResult: 'Normal', checkTime: '09:05' },
        offDuty: { timeResult: 'Normal', checkTime: '18:32' },
      }],
    ])
    const m = new Map([['u_present', inner]])
    const r = mapStatusForDay('u_present', DAY, trip, leave, m)
    expect(r.status).toBe('present')
    expect(r.onDuty?.checkTime).toBe('09:05')
    expect(r.offDuty?.checkTime).toBe('18:32')
  })

  it('preserves punches even when leave wins (partial-day leave)', () => {
    // Someone punched in the morning, then took a half-day leave. The leave
    // status wins for the day, but the punches must NOT be discarded (Codex
    // P2): they're real attendance data for the punch history / work minutes.
    const inner = new Map<string, DayAttendance>([
      [DAY, {
        onDuty: { timeResult: 'Normal', checkTime: '09:00' },
        offDuty: { timeResult: 'Normal', checkTime: '12:30' },
      }],
    ])
    const m = new Map([['u_leave', inner]])
    const r = mapStatusForDay('u_leave', DAY, trip, leave, m)
    expect(r.status).toBe('leave')
    expect(r.onDuty?.checkTime).toBe('09:00')
    expect(r.offDuty?.checkTime).toBe('12:30')
  })

  it('preserves punches even when trip wins (partial-day trip)', () => {
    const inner = new Map<string, DayAttendance>([
      [DAY, { onDuty: { timeResult: 'Normal', checkTime: '08:50' } }],
    ])
    const m = new Map([['u_trip', inner]])
    const r = mapStatusForDay('u_trip', DAY, trip, leave, m)
    expect(r.status).toBe('trip')
    expect(r.onDuty?.checkTime).toBe('08:50')
  })
})

describe('flattenAttendanceStats', () => {
  it('flattens the nested stats shape for SyncLog persistence', async () => {
    const { flattenAttendanceStats } = await import('@/lib/dingtalk-sync')
    const flat = flattenAttendanceStats({
      total: 94,
      stats: { present: 26, leave: 6, trip: 0, absent: 62 },
      finalizedDays: 1,
    })
    expect(flat).toEqual({ total: 94, finalizedDays: 1, present: 26, leave: 6, trip: 0, absent: 62 })
    // No nested `stats` key leaks through.
    expect(flat.stats).toBeUndefined()
  })
})

describe('parseTripWindow — 京外 商旅出差 (yyyy-MM-dd 上午/下午)', () => {
  function tripForm(startVal: string, endVal: string) {
    return [{
      name: '商旅出差',
      value: JSON.stringify([
        { props: { bizAlias: 'reason' }, value: '技术交流' },
        { props: { bizAlias: 'itinerary' }, value: JSON.stringify([{ rowValue: [
          { bizAlias: 'startTime', value: startVal },
          { bizAlias: 'endTime', value: endVal },
        ]}]) },
      ]),
    }]
  }
  it('parses 下午 half-day values (org-migration regression)', () => {
    const w = parseTripWindow(tripForm('2026-08-04 下午', '2026-08-06 下午'))
    expect(w.tripStart).not.toBeNull()
    expect(w.tripEnd).not.toBeNull()
    // 下午 → 14:00 Asia/Shanghai
    expect(new Date(w.tripStart!).toISOString()).toBe('2026-08-04T06:00:00.000Z')
    expect(new Date(w.tripEnd!).toISOString()).toBe('2026-08-06T06:00:00.000Z')
    expect(w.reason).toBe('技术交流')
  })
  it('parses 上午 half-day values', () => {
    const w = parseTripWindow(tripForm('2026-08-04 上午', '2026-08-05 上午'))
    expect(new Date(w.tripStart!).toISOString()).toBe('2026-08-04T00:00:00.000Z')
    expect(new Date(w.tripEnd!).toISOString()).toBe('2026-08-05T00:00:00.000Z')
  })
  it('still parses explicit HH:mm values (京内 format)', () => {
    const w = parseTripWindow(tripForm('2026-08-04 09:00', '2026-08-04 18:00'))
    expect(new Date(w.tripStart!).toISOString()).toBe('2026-08-04T01:00:00.000Z')
    expect(new Date(w.tripEnd!).toISOString()).toBe('2026-08-04T10:00:00.000Z')
  })
  it('returns null window for unparseable values (no crash)', () => {
    const w = parseTripWindow(tripForm('not-a-date', '2026-08-06 下午'))
    expect(w.tripStart).toBeNull()
  })
})

describe('fetchTripStatus — 同行人 attribution (mocked DingTalk API)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.DINGTALK_TRIP_PROCESS_CODE
  })

  function stubDingtalkApi(instanceForm: unknown[]) {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (u.includes('processinstance/listids')) {
        return new Response(JSON.stringify({ errcode: 0, result: { list: ['inst-a'], next_cursor: undefined } }), { status: 200 })
      }
      if (u.includes('processinstance/get')) {
        expect(body.process_instance_id).toBe('inst-a')
        return new Response(JSON.stringify({
          process_instance: {
            status: 'COMPLETED',
            result: 'agree',
            originator_userid: 'u_originator',
            form_component_values: instanceForm,
          },
        }), { status: 200 })
      }
      throw new Error(`unexpected fetch ${u}`)
    }))
  }

  const tripFormWithCompanions = [{
    name: '商旅出差',
    value: JSON.stringify([
      { props: { bizAlias: 'reason' }, value: '学术会议' },
      { props: { bizAlias: 'itinerary' }, value: JSON.stringify([{ rowValue: [
        { bizAlias: 'startTime', value: '2026-10-20 上午' },
        { bizAlias: 'endTime', value: '2026-10-22 下午' },
      ]}]) },
      {
        componentName: 'InnerContactField',
        props: { bizAlias: 'traveler', label: '出行人（同行人）' },
        extValue: JSON.stringify([
          { emplId: 'u_originator', name: '发起人本人' },
          { emplId: 'u_companion', name: '同行人甲' },
          { emplId: 'u_outsider', name: '不在同步范围' },
        ]),
        value: '发起人本人,同行人甲,不在同步范围',
      },
    ]),
  }]

  it('marks trip days for the originator AND synced companions (deduped)', async () => {
    process.env.DINGTALK_TRIP_PROCESS_CODE = 'PROC-TEST'
    stubDingtalkApi(tripFormWithCompanions)
    const byDay = await fetchTripStatus('token', ['u_originator', 'u_companion'], ['2026-10-21'])
    // Originator + companion both marked; u_outsider (not synced) dropped; the
    // originator self-listing in the traveler field must not double-count.
    expect([...byDay.keys()].sort()).toEqual(['u_companion', 'u_originator'])
    expect(byDay.get('u_originator')!.days.has('2026-10-21')).toBe(true)
    expect(byDay.get('u_companion')!.days.has('2026-10-21')).toBe(true)
    expect(byDay.get('u_companion')!.reason).toBe('学术会议')
  })

  it('keeps the instance when only a companion is in the synced set', async () => {
    process.env.DINGTALK_TRIP_PROCESS_CODE = 'PROC-TEST'
    stubDingtalkApi(tripFormWithCompanions)
    const byDay = await fetchTripStatus('token', ['u_companion'], ['2026-10-21'])
    expect(byDay.get('u_companion')?.days.has('2026-10-21')).toBe(true)
    expect(byDay.has('u_originator')).toBe(false)
  })

  it('marks nothing when neither originator nor companions are synced', async () => {
    process.env.DINGTALK_TRIP_PROCESS_CODE = 'PROC-TEST'
    stubDingtalkApi(tripFormWithCompanions)
    const byDay = await fetchTripStatus('token', ['u_unrelated'], ['2026-10-21'])
    expect(byDay.size).toBe(0)
  })
})
